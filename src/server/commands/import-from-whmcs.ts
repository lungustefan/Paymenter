import crypto from 'node:crypto';
import mysql, { type Connection, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { env, loadEnv } from '@/server/env';
import { closePool, getPool } from '@/server/db/connection';
import { dropAllTables, migrate } from '@/server/db/migrate';
import { hashPassword } from '@/server/lib/crypto';
import { slug as strSlug } from '@/server/lib/php';
import { Carbon } from '@/server/lib/carbon';

/**
 * Port of App\Console\Commands\ImportFromWhmcs (`app:import-from-whmcs {dbname} {username?} {host?} {port?}`).
 *
 * The WHMCS database is read through a plain mysql2 connection (the PDO one in the original), the Paymenter
 * database is written with the same table-level inserts (`DB::table(...)`) the original uses, so no model
 * events are fired for the imported rows. Behaviour (including a few oddities of the original, noted inline)
 * is kept 1:1.
 */

const USER = 'App\\Models\\User';
const PRODUCT = 'App\\Models\\Product';
const SERVICE = 'App\\Models\\Service';
const CONFIG_OPTION = 'App\\Models\\ConfigOption';

type Row = Record<string, any>;

export interface ImportPrompts {
    /** Laravel Prompts `text(..., required: true)` */
    text(question: string, placeholder?: string): Promise<string>;
    /** Laravel Prompts `password(..., required: true)` */
    password(question: string): Promise<string>;
}

export interface ImportArguments {
    dbname?: string;
    username?: string;
    host?: string;
    port?: string;
}

/** Equivalent of `$this->fail()` (ManuallyFailedException) */
export class ImportFailedException extends Error {}

class Importer {
    /** the WHMCS connection (PDO in the original) */
    private pdo!: Connection;
    /** the Paymenter connection: foreign key checks are a session setting so every write goes over this one */
    private db!: PoolConnection;
    private readonly batchSize = 500;

    constructor(private readonly info: (message: string) => void = console.log) {}

    /* ------------------------------ helpers ------------------------------ */

    private now(): string {
        return Carbon.now().toDateTimeString();
    }

    private fail(message: string): never {
        throw new ImportFailedException(message);
    }

    /** `$stmt->execute(); $stmt->fetchAll()` against WHMCS */
    private async fetchAll(sql: string, params: unknown[] = []): Promise<Row[]> {
        const [rows] = await this.pdo.query<RowDataPacket[]>(sql, params);
        return rows as Row[];
    }

    private async fetch(sql: string, params: unknown[] = []): Promise<Row | false> {
        return (await this.fetchAll(sql, params))[0] ?? false;
    }

    /** `DB::table($table)->insert($rows)` */
    private async insert(table: string, rows: Row[]): Promise<void> {
        if (rows.length === 0) return;
        const columns = Object.keys(rows[0]);
        await this.db.query(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES ?`, [
            rows.map((r) => columns.map((c) => (r[c] === undefined ? null : r[c]))),
        ]);
    }

    /** `DB::table($table)->insertGetId($row)` */
    private async insertGetId(table: string, row: Row): Promise<number> {
        const columns = Object.keys(row);
        const [result] = await this.db.query<any>(
            `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            columns.map((c) => (row[c] === undefined ? null : row[c])),
        );
        return Number(result.insertId);
    }

    private async dbFirst(sql: string, params: unknown[] = []): Promise<Row | null> {
        const [rows] = await this.db.query<RowDataPacket[]>(sql, params);
        return (rows[0] as Row) ?? null;
    }

    private bcrypt(plain: string): string {
        return hashPassword(plain);
    }

    private randomStr(length: number): string {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let out = '';
        for (let i = 0; i < length; i++) out += chars[crypto.randomInt(0, chars.length)];
        return out;
    }

    /** the currency of a WHMCS client (`SELECT * FROM tblcurrencies WHERE id = (SELECT currency FROM tblclients WHERE id = :client_id LIMIT 1) LIMIT 1`) */
    private clientCurrency(clientId: unknown): Promise<Row | false> {
        return this.fetch('SELECT * FROM tblcurrencies WHERE id = (SELECT currency FROM tblclients WHERE id = ? LIMIT 1) LIMIT 1', [clientId]);
    }

    /* ------------------------------ entry ------------------------------ */

    async handle(args: ImportArguments, prompts: ImportPrompts): Promise<void> {
        loadEnv();
        const dbname = args.dbname;
        if (!dbname) throw new ImportFailedException('Not enough arguments (missing: "dbname").');
        const host = await this.askOrUseENV(args.host, 'DB_HOST', 'Enter the host:', 'localhost', prompts);
        const port = await this.askOrUseENV(args.port, 'DB_PORT', 'Enter the port:', '3306', prompts);
        const username = await this.askOrUseENV(args.username, 'DB_USERNAME', 'Enter the username:', 'paymenter', prompts);
        const password = await prompts.password(`Enter the password for user '${username}':`);

        try {
            try {
                this.pdo = await mysql.createConnection({
                    host,
                    port: Number(port),
                    database: dbname,
                    user: username,
                    password,
                    dateStrings: true,
                    charset: 'utf8mb4',
                });
            } catch (e) {
                throw new PdoException((e as Error).message);
            }
            this.info('Connected to WHMCS database, Starting migration...');

            await this.prepareDatabase();

            this.db = await getPool().getConnection();
            try {
                await this.db.query('SET foreign_key_checks=0');

                // Remove default currencies
                await this.db.query('TRUNCATE TABLE `currencies`');
                // Import currencies
                await this.importCurrencies();
                await this.importUsers();
                await this.importAdmins();
                await this.importCategories();
                await this.importConfigOptions();
                await this.importProducts();
                await this.importTickets();
                await this.importOrders();
                await this.importServices();
                await this.importCancellations();
                await this.importInvoices();
                await this.importInvoiceItems();
                await this.importPayments();

                await this.db.query('SET foreign_key_checks=1');
            } finally {
                this.db.release();
            }

            const { flushSettingsCache } = await import('@/server/settings/store');
            await flushSettingsCache();
        } catch (e) {
            if (e instanceof PdoException || isSqlError(e)) this.fail('Connection failed: ' + (e as Error).message);
            throw e;
        } finally {
            await this.pdo?.end().catch(() => {});
        }
    }

    private async prepareDatabase() {
        // Rerun migrations (migrate:fresh --force)
        await dropAllTables();
        console.log('Dropped all tables successfully.');
        await migrate({ log: console.log });
        // Seed default data (db:seed --force)
        const { boot } = await import('@/server/bootstrap');
        await boot();
        const seed = await import('@/server/db/seed');
        await seed.seed(console.log);
        // db:seed --class=CustomPropertySeeder --force
        await seed.seedCustomProperties();
    }

    private async askOrUseENV(argValue: string | undefined, envKey: string, question: string, placeholder: string, prompts: ImportPrompts): Promise<string> {
        if (argValue) return argValue;

        const envValue = env(envKey);
        if (envValue !== undefined && envValue !== null && envValue !== '') return String(envValue);

        return prompts.text(question, placeholder);
    }

    protected validateDate(date: unknown): string | null {
        if (!date || date === '0' || date === '0000-00-00' || date === '0000-00-00 00:00:00') return null;

        const s = String(date);
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(s) ?? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
        if (!m) return null;

        const [y, mo, d, h = 0, mi = 0, se = 0] = m.slice(1).map((n) => (n === undefined ? 0 : Number(n)));
        // (like DateTime::createFromFormat, out of range parts roll over)
        const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
        // Validate year is reasonable (between 1900 and 2100)
        const year = dt.getUTCFullYear();
        if (year < 1900 || year > 2100) return null;

        const p = (n: number) => String(n).padStart(2, '0');
        return `${String(year).padStart(4, '0')}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`;
    }

    private async migrateInBatch(table: string, query: string, processor: (records: Row[]) => Promise<void>) {
        const run = async (offset: number) => this.fetchAll(query.replace(':limit', '?').replace(':offset', '?'), [this.batchSize, offset]);

        const nRows = await this.count(table);

        if (nRows <= this.batchSize) {
            const records = await run(0);
            try {
                await processor(records);
            } catch (th) {
                this.logError(th);
                this.fail((th as Error).message);
            }
        } else {
            const max = Math.round(nRows / this.batchSize);
            let current = 0;
            const draw = () => {
                // Symfony ProgressBar: a bar can not exceed its maximum
                const m = Math.max(max, current);
                const width = 28;
                const done = Math.floor((current / m) * width);
                const bar = current >= m ? '='.repeat(width) : '='.repeat(Math.max(done - 1, 0)) + (done > 0 ? '>' : '') + '-'.repeat(width - Math.max(done, 0));
                const pct = String(Math.floor((current / m) * 100)).padStart(3, ' ');
                process.stdout.write(`Batch: ${current}/${m} [${bar.slice(0, width)}] ${pct}%\n`);
            };
            draw();
            let offset = 0;
            let records = await run(offset);
            while (records.length > 0) {
                const batch = records;
                offset += this.batchSize;
                records = await run(offset);

                try {
                    await processor(batch);
                } catch (th) {
                    this.logError(th);
                    this.fail((th as Error).message);
                }

                current++;
                draw();
            }
        }

        this.info('Done.');
    }

    private logError(e: unknown) {
        console.error(e);
    }

    private async count(table: string): Promise<number> {
        const result = await this.fetch('SELECT COUNT(*) as count FROM ' + table);
        return Number((result && result.count) ?? 0);
    }

    /* ------------------------------ importers ------------------------------ */

    private async importCurrencies() {
        this.info(`Importing currencies... (${await this.count('tblcurrencies')} records)`);

        await this.migrateInBatch('tblcurrencies', 'SELECT * FROM tblcurrencies LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            const { Setting } = await import('@/server/models/Setting');
            for (const record of records) {
                const format =
                    record.format === 1 ? '1 000.00' : record.format === 2 ? '1,000.00' : record.format === 4 ? '1 000,00' : '1.000,00';
                data.push({
                    name: record.code,
                    code: record.code,
                    prefix: record.prefix,
                    suffix: record.suffix,
                    format,
                });
                if (record.default == 1) {
                    // Set default currency
                    await Setting.updateOrCreate({ key: 'default_currency' }, { value: record.code });
                }
            }

            await this.insert('currencies', data);
        });
    }

    private async importUsers() {
        this.info(`Importing users... (${await this.count('tblclients')} records)`);
        const { CustomProperty } = await import('@/server/models/CustomProperty');
        const customProperties = new Map<string, any>();
        for (const p of await CustomProperty.where('model', USER).get()) customProperties.set(p.key as string, p);

        await this.migrateInBatch('tblclients', 'SELECT * FROM tblclients LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            const properties: Row[] = [];
            const credits: Row[] = [];

            for (const record of records) {
                // Get client (join tblusers_clients on tblusers.id = tblusers_clients.auth_user_id and tblusers_clients.owner = 1)
                const user = await this.fetch(
                    'SELECT * FROM tblusers WHERE id = (SELECT auth_user_id FROM tblusers_clients WHERE client_id = ? AND owner = 1 LIMIT 1)',
                    [record.id],
                );
                if (!user) continue;

                data.push({
                    id: record.id,
                    first_name: record.firstname,
                    last_name: record.lastname,
                    email: record.email,
                    password: user.password,
                    email_verified_at: user.email_verified_at ? user.email_verified_at : null,
                    updated_at: record.updated_at == '0000-00-00 00:00:00' ? this.now() : record.updated_at,
                    created_at: record.created_at == '0000-00-00 00:00:00' ? this.now() : record.created_at,
                });

                // Custom properties
                for (const [key, property] of customProperties) {
                    // address1 -> address, companyname -> company_name
                    const whmcsKey =
                        key === 'address' ? 'address1' : key === 'company_name' ? 'companyname' : key === 'postcode' ? 'zip' : key === 'phonenumber' ? 'phone' : key;
                    // (the original tests the Paymenter key here and reads the WHMCS key below)
                    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
                        properties.push({
                            key,
                            value: record[whmcsKey],
                            model_id: record.id,
                            model_type: USER,
                            name: property.name,
                            custom_property_id: property.id,
                            created_at: this.now(),
                            updated_at: this.now(),
                        });
                    }
                }

                // Credits
                if (Number(record.credit) > 0) {
                    const currency = await this.fetch('SELECT * FROM tblcurrencies WHERE id = ? LIMIT 1', [record.currency]);
                    credits.push({
                        user_id: record.id,
                        amount: record.credit,
                        currency_code: (currency && currency.code) ?? null,
                        created_at: this.now(),
                        updated_at: this.now(),
                    });
                }
            }

            await this.insert('users', data);
            if (properties.length > 0) await this.insert('properties', properties);
            if (credits.length > 0) await this.insert('credits', credits);
        });
    }

    private async importAdmins() {
        this.info(`Importing admins... (${await this.count('tbladmins')} records)`);

        await this.migrateInBatch('tbladmins', 'SELECT * FROM tbladmins LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                if (
                    record.roleid != 1 ||
                    record.disabled == 1 ||
                    (await this.dbFirst('SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1', [record.email]))
                ) {
                    // Only import administrators
                    continue;
                }
                data.push({
                    id: record.id,
                    first_name: record.firstname,
                    last_name: record.lastname,
                    email: record.email,
                    password: record.password,
                    role_id: 1, // Admin role
                    email_verified_at: null,
                    created_at: record.created_at,
                    updated_at: record.lastlogin ?? this.now(),
                });
            }
            // NOTE: the original builds $data but never inserts it, so admins are not actually imported.
            void data;
        });
    }

    private async importCategories() {
        this.info(`Importing categories... (${await this.count('tblproductgroups')} records)`);

        await this.migrateInBatch('tblproductgroups', 'SELECT * FROM tblproductgroups LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                data.push({
                    id: record.id,
                    name: record.name,
                    description: record.tagline,
                    sort: record.order,
                    slug: record.slug,
                    created_at: record.created_at,
                    updated_at: record.updated_at,
                });
            }

            await this.insert('categories', data);
        });
    }

    private async importConfigOptions() {
        this.info(`Importing config options... (${await this.count('tblproductconfigoptions')} records)`);

        await this.migrateInBatch('tblproductconfigoptions', 'SELECT * FROM tblproductconfigoptions LIMIT :limit OFFSET :offset', async (records) => {
            const planData: Record<string, Row> = {};
            const priceData: Record<string, Row[]> = {};

            // First, insert parent config options and track their new IDs
            for (const record of records) {
                let environmentVariable: string | null;
                let name: string;
                if (record.optionname.includes('|')) {
                    environmentVariable = record.optionname.split('|')[0];
                    name = record.optionname.split('|')[1] ?? record.optionname;
                } else {
                    environmentVariable = null;
                    name = record.optionname;
                }

                const parentData = {
                    name,
                    env_variable: environmentVariable,
                    type: record.optiontype === 1 ? 'select' : record.optiontype === 2 ? 'radio' : record.optiontype === 3 ? 'checkbox' : record.optiontype === 4 ? 'number' : 'select',
                    sort: record.order,
                    hidden: record.hidden,
                    created_at: this.now(),
                    updated_at: this.now(),
                };

                // Insert parent and get the new generated ID
                const newParentId = await this.insertGetId('config_options', parentData);

                // Get child options for this parent
                const optionRecords = await this.fetchAll('SELECT * FROM tblproductconfigoptionssub WHERE configid = ?', [record.id]);

                for (const option of optionRecords) {
                    if (option.optionname.includes('|')) {
                        environmentVariable = option.optionname.split('|')[0];
                        name = option.optionname.split('|')[1] ?? option.optionname;
                    } else {
                        environmentVariable = null;
                        name = option.optionname;
                    }

                    const childData = {
                        parent_id: newParentId, // Use the new generated parent ID
                        name,
                        env_variable: environmentVariable,
                        sort: option.sortorder,
                        created_at: this.now(),
                        updated_at: this.now(),
                    };

                    // Insert child and get the new generated ID
                    const newChildId = await this.insertGetId('config_options', childData);

                    // Get pricing for the option
                    const prices = await this.fetchAll('SELECT * FROM tblpricing WHERE type = "configoptions" AND relid = ?', [option.id]);

                    await this.priceMagic(prices, planData, priceData, { id: newChildId, paytype: 'recurring' }, CONFIG_OPTION);
                }
            }

            // Insert plans and then prices
            await this.insertPlans(planData, priceData);
        });
    }

    /** "Insert plans and then prices" */
    private async insertPlans(planData: Record<string, Row>, priceData: Record<string, Row[]>) {
        for (const [planKey, plan] of Object.entries(planData)) {
            const planId = await this.insertGetId('plans', plan);
            if (priceData[planKey]) {
                for (const price of priceData[planKey]) price.plan_id = planId;
                await this.insert('prices', priceData[planKey]);
            }
        }
    }

    private async priceMagic(prices: Row[], planData: Record<string, Row>, priceData: Record<string, Row[]>, record: Row, priceableType: string = PRODUCT) {
        for (const pricing of prices) {
            if (record.paytype === 'onetime') {
                // One-time payment product, create a one-time plan
                const setupFee = pricing.msetupfee ?? 0;

                // Create a unique key to link plan and price
                const planKey = record.id + '_onetime';

                planData[planKey] = {
                    priceable_id: record.id,
                    priceable_type: priceableType,
                    name: 'One-Time',
                    type: 'one-time',
                    billing_period: 0,
                    billing_unit: null,
                };

                const currency = await this.fetch('SELECT * FROM tblcurrencies WHERE id = ? LIMIT 1', [pricing.currency]);

                (priceData[planKey] ??= []).push({
                    currency_code: (currency as Row).code,
                    price: pricing.monthly,
                    setup_fee: setupFee,
                });

                continue;
            }

            for (const period of ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially']) {
                if (Number(pricing[period]) > 0) {
                    const setupFee = {
                        monthly: pricing.msetupfee,
                        quarterly: pricing.qsetupfee,
                        semiannually: pricing.ssetupfee,
                        annually: pricing.asetupfee,
                        biennially: pricing.bsetupfee,
                        triennially: pricing.tsetupfee,
                    }[period];

                    // Create a unique key to link plan and price
                    const planKey = record.id + '_' + period;

                    planData[planKey] = {
                        priceable_id: record.id,
                        priceable_type: priceableType,
                        name: period.charAt(0).toUpperCase() + period.slice(1),
                        type: 'recurring',
                        billing_period: { monthly: 1, quarterly: 3, semiannually: 6, annually: 1, biennially: 2, triennially: 3 }[period],
                        billing_unit: ['monthly', 'quarterly', 'semiannually'].includes(period) ? 'month' : 'year',
                    };

                    const currency = await this.fetch('SELECT * FROM tblcurrencies WHERE id = ? LIMIT 1', [pricing.currency]);

                    (priceData[planKey] ??= []).push({
                        currency_code: (currency as Row).code,
                        price: pricing[period],
                        setup_fee: setupFee,
                    });
                }
            }
        }
    }

    private async importProducts() {
        this.info(`Importing products... (${await this.count('tblproducts')} records)`);

        await this.migrateInBatch('tblproducts', 'SELECT * FROM tblproducts LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            const planData: Record<string, Row> = {};
            const priceData: Record<string, Row[]> = {};
            const upgrades: Row[] = [];

            for (const record of records) {
                data.push({
                    id: record.id,
                    category_id: record.gid,
                    name: record.name,
                    description: record.description,
                    slug: record.slug ? record.slug : strSlug(record.name),
                    hidden: record.hidden,
                    stock: record.stockcontrol ? record.qty : null,
                    allow_quantity: record.allowqty === 1 ? 'separated' : record.allowqty === 3 ? 'combined' : 'disabled',
                    created_at: record.created_at,
                    updated_at: record.updated_at,
                });

                // Upgrades
                const upgradeRecords = await this.fetchAll('SELECT * FROM tblproduct_upgrade_products WHERE product_id = ?', [record.id]);

                for (const upgrade of upgradeRecords) {
                    upgrades.push({
                        product_id: upgrade.product_id,
                        upgrade_id: upgrade.upgrade_product_id,
                        created_at: this.now(),
                        updated_at: this.now(),
                    });
                }

                // Config options
                const configOptionRecords = await this.fetchAll('SELECT * FROM tblproductconfiglinks WHERE pid = ?', [record.id]);

                for (const configOptionGroupId of configOptionRecords) {
                    // Get the config option group
                    const configOptionGroup = await this.fetch('SELECT * FROM tblproductconfiggroups WHERE id = ? LIMIT 1', [configOptionGroupId.gid]);
                    if (!configOptionGroup) continue;
                    // Get config options in the group
                    const configOptions = await this.fetchAll('SELECT * FROM tblproductconfigoptions WHERE gid = ?', [configOptionGroup.id]);
                    for (const configOption of configOptions) {
                        // Link config option to product
                        await this.insert('config_option_products', [{ product_id: record.id, config_option_id: configOption.id }]);
                    }
                }
            }

            // Insert products first
            await this.insert('products', data);

            // Insert upgrades
            if (upgrades.length > 0) await this.insert('product_upgrades', upgrades);

            // Now process plans for all products in this batch
            for (const record of records) {
                if (record.paytype === 'free') {
                    // Free product, create a free plan
                    planData[record.id + '_free'] = {
                        priceable_id: record.id,
                        priceable_type: PRODUCT,
                        name: 'Free',
                        type: 'free',
                    };

                    continue;
                }
                const prices = await this.fetchAll('SELECT * FROM tblpricing WHERE type = "product" AND relid = ?', [record.id]);

                await this.priceMagic(prices, planData, priceData, record);
            }

            // Insert plans and then prices
            await this.insertPlans(planData, priceData);
        });
    }

    private async getUserIdTicket(message: Row, userId: any): Promise<any> {
        if (!userId) {
            if (message.admin !== '') {
                // Admin is a first name + last name in WHMCS
                const user = await this.dbFirst("SELECT * FROM `users` WHERE CONCAT(first_name, ' ', last_name) = ? OR `first_name` = ? LIMIT 1", [
                    message.admin,
                    message.admin,
                ]);
                if (user) userId = user.id;
                // If not, we will make a admin account where we will attach all admin messages
                if (!userId) {
                    userId = await this.insertGetId('users', {
                        first_name: message.admin,
                        last_name: '',
                        email: 'admin+' + String(message.admin ?? '').replaceAll(' ', '_').toLowerCase() + '@paymenter.org',
                        password: this.bcrypt(this.randomStr(16)),
                        created_at: this.now(),
                        updated_at: this.now(),
                    });
                }
            }
            if (!userId && (await this.dbFirst('SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1', [message.email]))) {
                const userRecord = await this.dbFirst('SELECT * FROM `users` WHERE `email` = ? LIMIT 1', [message.email]);
                userId = userRecord!.id;
            }
            if (!userId) {
                // Create a user with the email
                userId = await this.insertGetId('users', {
                    first_name: message.name,
                    last_name: '',
                    email: message.email,
                    password: this.bcrypt(this.randomStr(16)),
                    created_at: this.now(),
                    updated_at: this.now(),
                });
            }
        }

        return userId;
    }

    private async importTickets() {
        this.info(`Importing tickets... (${await this.count('tbltickets')} records)`);

        await this.migrateInBatch('tbltickets', 'SELECT * FROM tbltickets LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            const messages: Row[] = [];
            // (declared outside of the loop: in the original the value of the previous ticket leaks into tickets without a department)
            let departmentName: string | undefined;
            for (const record of records) {
                // Get user
                record.userid = await this.getUserIdTicket(record, record.userid);
                const user = record.userid;

                if (!user) continue;

                const department = await this.fetch('SELECT * FROM tblticketdepartments WHERE id = ? LIMIT 1', [record.did]);
                if (department) {
                    // You can map department to category if needed
                    departmentName = department.name;
                }

                data.push({
                    id: record.id,
                    user_id: user,
                    subject: record.title,
                    status: record.status === 'Answered' ? 'replied' : record.status === 'Closed' ? 'closed' : 'open',
                    priority: record.urgency === 'Low' ? 'low' : record.urgency === 'Medium' ? 'medium' : record.urgency === 'High' ? 'high' : 'medium',
                    department: departmentName ?? null,
                    created_at: this.validateDate(record.date),
                    updated_at: this.validateDate(record.lastreply),
                });

                // Get ticket messages
                const messageRecords = await this.fetchAll('SELECT * FROM tblticketreplies WHERE tid = ? ORDER BY date ASC', [record.id]);
                for (const message of messageRecords) {
                    // Get admin user if any
                    const userId = await this.getUserIdTicket(message, message.userid);
                    messages.push({
                        ticket_id: record.id,
                        user_id: userId,
                        message: message.message,
                        created_at: this.validateDate(message.date),
                        updated_at: this.validateDate(message.date),
                    });
                }
            }

            await this.insert('tickets', data);
            if (messages.length > 0) await this.insert('ticket_messages', messages);
        });
    }

    private async importOrders() {
        this.info(`Importing orders... (${await this.count('tblorders')} records)`);

        await this.migrateInBatch('tblorders', 'SELECT * FROM tblorders LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                // Get currency from user
                const user = await this.clientCurrency(record.userid);
                if (!user) continue;

                data.push({
                    id: record.id,
                    user_id: record.userid,
                    currency_code: user.code,
                    created_at: this.validateDate(record.date),
                    updated_at: this.validateDate(record.date),
                });
            }

            await this.insert('orders', data);
        });
    }

    private async importServices() {
        this.info(`Importing services... (${await this.count('tblhosting')} records)`);

        await this.migrateInBatch('tblhosting', 'SELECT * FROM tblhosting LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                // Get currency from user
                const user = await this.clientCurrency(record.userid);
                if (!user) continue;

                const planName =
                    {
                        Monthly: 'Monthly',
                        Quarterly: 'Quarterly',
                        'Semi-Annually': 'Semiannually',
                        Annually: 'Annually',
                        Biennially: 'Biennially',
                        Triennially: 'Triennially',
                        'One Time': 'One-Time',
                        'Free Account': 'Free',
                    }[record.billingcycle as string] ?? 'Monthly';
                const plan = await this.dbFirst('SELECT * FROM `plans` WHERE `priceable_id` = ? AND `priceable_type` = ? AND `name` = ? LIMIT 1', [
                    record.packageid,
                    PRODUCT,
                    planName,
                ]);
                const planId = plan?.id ?? null;

                data.push({
                    id: record.id,
                    order_id: record.orderid,
                    product_id: record.packageid,
                    status:
                        { Active: 'active', Suspended: 'suspended', Terminated: 'cancelled', Cancelled: 'cancelled', Fraud: 'cancelled', Pending: 'pending' }[
                            record.domainstatus as string
                        ] ?? 'pending',
                    price: record.amount,
                    quantity: record.qty,
                    user_id: record.userid,
                    plan_id: planId,
                    currency_code: user.code,
                    expires_at: this.validateDate(record.nextduedate),
                    created_at: this.validateDate(record.regdate),
                    updated_at: this.validateDate(record.regdate),
                });
            }

            await this.insert('services', data);
        });
    }

    private async importCancellations() {
        this.info(`Importing cancellations... (${await this.count('tblcancelrequests')} records)`);

        await this.migrateInBatch('tblcancelrequests', 'SELECT * FROM tblcancelrequests LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                data.push({
                    id: record.id,
                    service_id: record.relid,
                    reason: Array.from(String(record.reason ?? '')).slice(0, 255).join(''),
                    type: record.type == 'End of Billing Period' ? 'end_of_period' : 'immediate',
                    created_at: this.validateDate(record.date),
                    updated_at: this.validateDate(record.date),
                });
            }

            await this.insert('service_cancellations', data);
        });
    }

    private async importInvoices() {
        this.info(`Importing invoices... (${await this.count('tblinvoices')} records)`);

        await this.migrateInBatch('tblinvoices', 'SELECT * FROM tblinvoices LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            const [numberRows] = await this.db.query<RowDataPacket[]>('SELECT `number` FROM `invoices` WHERE `number` IS NOT NULL');
            const existingNumbers = new Set<string>(numberRows.map((r) => String(r.number)));

            for (const record of records) {
                // Get currency from user
                const user = await this.clientCurrency(record.userid);
                if (!user) continue;

                let invoiceNumber: any = record.invoicenum ? record.invoicenum : null;

                // If invoice number already exists, set it to null to avoid duplicate key error
                if (invoiceNumber && existingNumbers.has(String(invoiceNumber))) {
                    invoiceNumber = null;
                } else if (invoiceNumber) {
                    existingNumbers.add(String(invoiceNumber));
                }

                data.push({
                    id: record.id,
                    number: invoiceNumber,
                    user_id: record.userid,
                    status: { Paid: 'paid', Unpaid: 'unpaid', Cancelled: 'cancelled', Refunded: 'cancelled' }[record.status as string] ?? 'unpaid',
                    currency_code: user.code,
                    created_at: this.validateDate(record.date),
                    updated_at: this.validateDate(record.date),
                });
            }

            await this.insert('invoices', data);
        });

        // Set invoice number in settings to highest imported invoice number + 1
        const [[max]] = await this.db.query<RowDataPacket[][]>('SELECT MAX(`id`) AS aggregate FROM `invoices`');
        const highestInvoiceNumber = Number((max as Row)?.aggregate ?? 0);
        const { Setting } = await import('@/server/models/Setting');
        await Setting.updateOrCreate({ key: 'invoice_number' }, { value: highestInvoiceNumber + 1 });
    }

    private async importInvoiceItems() {
        this.info(`Importing invoice items... (${await this.count('tblinvoiceitems')} records)`);

        await this.migrateInBatch('tblinvoiceitems', 'SELECT * FROM tblinvoiceitems LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                data.push({
                    id: record.id,
                    invoice_id: record.invoiceid,
                    description: Array.from(String(record.description ?? '')).slice(0, 255).join(''),
                    price: record.amount,
                    created_at: this.now(),
                    updated_at: this.now(),
                    reference_type: record.type === 'Hosting' ? SERVICE : null,
                    reference_id: record.relid,
                });
            }

            await this.insert('invoice_items', data);
        });
    }

    private async importPayments() {
        this.info(`Importing payments... (${await this.count('tblaccounts')} records)`);

        await this.migrateInBatch('tblaccounts', 'SELECT * FROM tblaccounts LIMIT :limit OFFSET :offset', async (records) => {
            const data: Row[] = [];
            for (const record of records) {
                // Get currency from user
                const user = await this.clientCurrency(record.userid);
                if (!user) continue;

                data.push({
                    id: record.id,
                    invoice_id: record.invoiceid,
                    amount: record.amountin,
                    transaction_id: record.transid,
                    created_at: this.validateDate(record.date),
                    updated_at: this.validateDate(record.date),
                });
            }

            await this.insert('invoice_transactions', data);
        });
    }
}

/** stand-in for PDOException when the connection to WHMCS can not be opened */
class PdoException extends Error {}

function isSqlError(e: unknown): boolean {
    return !!e && typeof e === 'object' && ('sqlState' in e || 'errno' in e) && !(e instanceof ImportFailedException);
}

export async function importFromWhmcs(args: ImportArguments, prompts: ImportPrompts, info: (message: string) => void = console.log) {
    try {
        await new Importer(info).handle(args, prompts);
    } finally {
        await closePool();
    }
}
