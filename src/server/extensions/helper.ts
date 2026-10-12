import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { extensionRegistry, type ExtensionEntry } from '@/generated/registry';
import { AdjustmentNoteType, InvoiceTransactionStatus } from '@/server/enums';
import { cacheGet, cachePut } from '@/server/cache';
import { currentDb, transaction } from '@/server/orm';
import { recordAudit } from '@/server/orm/audit';
import type { Extension as ExtensionBase } from './Extension';
import type { ConfigDefinition, ExtensionMeta, ExtensionPage, ExtensionRoute } from './types';
import { Extension } from '@/server/models/Extension';
import { Gateway } from '@/server/models/Gateway';
import { Server } from '@/server/models/Server';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { BillingAgreement } from '@/server/models/BillingAgreement';
import type { Product } from '@/server/models/Product';
import type { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';
import type { Setting } from '@/server/models/Setting';
import { migrationsPath } from '@/server/db/migrate';
import { dbConfig, getPool } from '@/server/db/connection';
import { discoverPhpExtensions, type PhpExtensionInfo } from './php/discovery';
import { phpAvailability } from './php/bridge';

/** Port of App\Helpers\ExtensionHelper. */

export interface AvailableExtension {
    name: string;
    type: string;
    meta: ExtensionMeta | null;
    /** `php`: an upstream-layout PHP extension running through the PHP bridge */
    runtime?: 'php';
    /** why the extension cannot run right now (e.g. php is not installed) */
    unavailable?: string;
    /** parts of the extension that cannot run on the Node.js panel */
    warnings?: string[];
}

type ExtensionCtor = new (config?: Record<string, any>) => ExtensionBase;

const moduleCache = new Map<string, { Cls: ExtensionCtor; mod: any }>();

function entryFor(type: string, name: string): ExtensionEntry | undefined {
    return extensionRegistry.find((e) => e.type === type.toLowerCase() && e.name.toLowerCase() === name.toLowerCase());
}

/** upstream-layout PHP extension (extensions/<Type>/<Name>/<Name>.php) without a TypeScript entry */
export function phpEntryFor(type: string, name: string): PhpExtensionInfo | undefined {
    if (entryFor(type, name)) return undefined;
    return discoverPhpExtensions().find((e) => e.type === type.toLowerCase() && e.name.toLowerCase() === name.toLowerCase());
}

async function loadPhpClass(info: PhpExtensionInfo): Promise<{ Cls: ExtensionCtor; mod: any }> {
    const key = `php:${info.type}:${info.name}`;
    let hit = moduleCache.get(key);
    if (!hit) {
        const a = phpAvailability();
        if (!a.ok) throw new Error(a.reason);
        const [{ getPhpBridge }, { createPhpExtensionClass }] = await Promise.all([import('./php/runtime'), import('./php/PhpExtension')]);
        const desc = await getPhpBridge().call('describe', { type: info.type, name: info.name });
        hit = { Cls: createPhpExtensionClass(info, desc) as unknown as ExtensionCtor, mod: {} };
        moduleCache.set(key, hit);
    }
    return hit;
}

async function loadClass(type: string, name: string): Promise<{ Cls: ExtensionCtor; mod: any }> {
    const entry = entryFor(type, name);
    if (!entry) {
        const php = phpEntryFor(type, name);
        if (php) return loadPhpClass(php);
        throw new Error(`Extension "${name}" not found`);
    }
    const key = `${entry.type}:${entry.name}`;
    let hit = moduleCache.get(key);
    if (!hit) {
        const mod = await entry.load();
        const Cls = (mod.default ?? mod[entry.name]) as ExtensionCtor;
        if (!Cls) throw new Error(`Extension "${name}" not found`);
        hit = { Cls, mod };
        moduleCache.set(key, hit);
    }
    return hit;
}

/** `$settings` may be a collection of Setting models, a single model, or an array. */
export function settingsToArray(settings: unknown): Record<string, any> {
    if (Array.isArray(settings)) {
        const out: Record<string, any> = {};
        for (const s of settings as Setting[]) out[s.key] = s.value;
        return out;
    }
    if (settings && typeof settings === 'object') return settings as Record<string, any>;
    return {};
}

export class ExtensionHelper {
    static async getAvailableExtensions(): Promise<AvailableExtension[]> {
        const out: AvailableExtension[] = [];
        for (const e of extensionRegistry) {
            try {
                const { Cls } = await loadClass(e.type, e.name);
                out.push({ name: e.name, type: e.type, meta: (Cls as any).meta ?? null });
            } catch {
                /* broken extension: skip */
            }
        }
        for (const info of discoverPhpExtensions()) {
            if (out.some((o) => o.type === info.type && o.name === info.name)) continue;
            try {
                const { Cls } = await loadPhpClass(info);
                out.push({ name: info.name, type: info.type, meta: (Cls as any).meta ?? null, runtime: 'php', warnings: info.warnings });
            } catch (e: any) {
                // php missing / extension does not load: still listed, with the reason, instead of vanishing
                out.push({ name: info.name, type: info.type, meta: { name: info.name, description: '', version: '', author: '' }, runtime: 'php', unavailable: String(e?.message ?? e), warnings: info.warnings });
            }
        }
        return out;
    }

    static async getExtensions(type?: string): Promise<AvailableExtension[]> {
        const all = await this.getAvailableExtensions();
        if (type === 'other') return all.filter((e) => !['gateway', 'server'].includes(e.type));
        if (type) return all.filter((e) => e.type === type.toLowerCase());
        return all;
    }

    static async getExtension(type: string, extension: string, config: unknown = {}): Promise<ExtensionBase> {
        const { Cls } = await loadClass(type, extension);
        let values = settingsToArray(config);
        if (Object.keys(values).length === 0) {
            // `Extension::config()` loads the saved settings itself when it was not given any
            const Model = type === 'gateway' ? Gateway : type === 'server' ? Server : Extension;
            try {
                const row = await Model.query().where('extension', extension).first();
                if (row) values = await row.settingsMap();
            } catch {
                /* tables may not exist yet */
            }
        }
        return new Cls(values);
    }

    static async getModule(type: string, extension: string) {
        return (await loadClass(type, extension)).mod;
    }

    static async getConfig(type: string, extension: string, config: Record<string, any> = {}): Promise<ConfigDefinition[]> {
        let values = config;
        if (Object.keys(values).length === 0) {
            const Model = type === 'gateway' ? Gateway : type === 'server' ? Server : Extension;
            const row = await Model.query().where('extension', extension).first();
            values = row ? await row.settingsMap() : {};
        }
        return (await this.getExtension(type, extension)).getConfig(values) as Promise<ConfigDefinition[]>;
    }

    static async hasFunction(extension: Extension, fn: string): Promise<boolean> {
        const instance = await this.getExtension(extension.type, extension.extension, await extension.rel('settings'));
        return typeof (instance as any)[fn] === 'function';
    }

    static async testConfig(extension: Extension, values: Record<string, any>) {
        const instance = await this.getExtension(extension.type, extension.extension, values);
        return instance.testConfig?.();
    }

    static async getCheckoutConfig(product: Product, values: Record<string, any> = {}) {
        const server = await product.rel('server');
        if (!server) return [];
        return (await this.call(server, 'getCheckoutConfig', [product, values, settingsToArray(await product.rel('settings'))], true)) ?? [];
    }

    static async getInstallableExtensions(): Promise<AvailableExtension[]> {
        const others = await this.getExtensions('other');
        const installed = (await Extension.all<Extension>()).map((e) => e.extension);
        return others.filter((e) => !installed.includes(e.name));
    }

    /** Call a function on an installed extension; with `mayFail` errors are reported instead of thrown. */
    static async call(extension: Extension, fn: string, args: any[] = [], mayFail = false): Promise<any> {
        try {
            const instance = await this.getExtension(extension.type, extension.extension, await extension.rel('settings'));
            if (typeof (instance as any)[fn] !== 'function') throw new Error('Function not found');
            return await (instance as any)[fn](...args);
        } catch (e: any) {
            if (!mayFail) throw e;
            // If extension error is Not Found, don't report
            if (!String(e?.message ?? '').endsWith('not found')) console.error(`[extension:${extension.extension}] ${fn} failed:`, e);
        }
    }

    static async callService(service: Service, fn: string, args: any[] = [], mayFail = false) {
        const product = (await service.rel('product'))!;
        const server = await product.rel('server');
        if (!server) {
            if (mayFail) throw new Error('No server assigned to this product');
            return;
        }
        return this.call(server, fn, [service, settingsToArray(await product.rel('settings')), await this.getServiceProperties(service), ...args], mayFail);
    }

    static async getConfigAsInputs(type: string, name: string | null, config: Record<string, any> = {}): Promise<ConfigDefinition[]> {
        if (!name) return [];
        try {
            return (await this.getConfig(type, name, config)).map((c) => ({ ...c, name: `settings.${c.name}` }));
        } catch (e: any) {
            return [{ name: 'error', type: 'placeholder', label: String(e?.message ?? e) }];
        }
    }

    static async getProductConfig(server: Extension, values: Record<string, any> = {}) {
        return this.call(server, 'getProductConfig', [values]);
    }

    /** Memoised for 60 seconds, keyed by server + values. */
    static async getProductConfigOnce(server: Extension, values: Record<string, any> = {}) {
        const cache = (await cacheGet<Record<string, any>>('product_config')) ?? {};
        const key = `${server.extension}${server.id}${JSON.stringify(values)}`;
        if (!(key in cache)) cache[key] = await this.getProductConfig(server, values);
        await cachePut('product_config', cache, 60);
        return cache[key];
    }

    /* ---------------- gateways ---------------- */

    static async getCheckoutGateways(total: number, currency: string, type: string, items: unknown[] = []): Promise<Gateway[]> {
        const gateways: Gateway[] = [];
        for (const gateway of await Gateway.query().with('settings').get()) {
            const instance = await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'));
            if (typeof (instance as any).canUseGateway === 'function') {
                if (await (instance as any).canUseGateway(total, currency, type, items)) gateways.push(gateway);
            } else {
                gateways.push(gateway);
            }
        }
        return gateways;
    }

    static async pay(gateway: Gateway, invoice: Invoice) {
        const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
        return instance.pay(invoice, await invoice.remaining());
    }

    static async charge(gateway: Gateway, invoice: Invoice, billingAgreement: BillingAgreement): Promise<boolean> {
        const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
        return instance.charge(invoice, await invoice.remaining(), billingAgreement);
    }

    static async getBillingAgreementGateways(): Promise<Gateway[]> {
        const gateways: Gateway[] = [];
        for (const gateway of await Gateway.query().with('settings').get()) {
            const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
            if (typeof instance.supportsBillingAgreements === 'function' && (await instance.supportsBillingAgreements())) gateways.push(gateway);
        }
        return gateways;
    }

    static async createBillingAgreement(user: User, gateway: Gateway) {
        const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
        return instance.createBillingAgreement(user);
    }

    static async cancelBillingAgreement(billingAgreement: BillingAgreement) {
        const gateway = (await billingAgreement.rel('gateway'))!;
        const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
        return instance.cancelBillingAgreement(billingAgreement);
    }

    static async makeBillingAgreement(user: User, gateway: string, name: string, externalReference: string, type: string | null = null, expiry: any = null) {
        const gw = await Gateway.query().where('extension', gateway).firstOrFail();
        return BillingAgreement.updateOrCreate(
            { external_reference: externalReference, user_id: user.id, gateway_id: gw.id },
            { name, type, expiry },
        );
    }

    /** Record a payment on an invoice (idempotent per `transactionId`). */
    static async addPayment(
        invoice: Invoice | number,
        gateway: string | null | undefined,
        amount: number,
        fee: number | null = null,
        transactionId: string | null = null,
        status: InvoiceTransactionStatus = InvoiceTransactionStatus.Succeeded,
        isCreditTransaction = false,
    ): Promise<InvoiceTransaction> {
        const gw = gateway ? await Gateway.query().where('extension', gateway).first() : null;
        return transaction(async () => {
            // Lock the invoice for update to prevent race conditions
            const locked = await Invoice.query()
                .where('id', invoice instanceof Invoice ? invoice.id : invoice)
                .lockForUpdate()
                .firstOrFail();

            if (!transactionId) {
                return locked.relation<InvoiceTransaction>('transactions').create({
                    gateway_id: gw?.id ?? null,
                    amount,
                    fee,
                    status,
                    is_credit_transaction: isCreditTransaction,
                });
            }
            const data: Record<string, any> = { gateway_id: gw?.id ?? null, amount, status, is_credit_transaction: isCreditTransaction };
            if (fee !== null) data.fee = fee;
            return locked.relation<InvoiceTransaction>('transactions').updateOrCreate({ transaction_id: transactionId }, data);
        });
    }

    static addProcessingPayment(invoice: Invoice | number, gateway: string, amount: number, fee: number | null = null, transactionId: string | null = null) {
        return this.addPayment(invoice, gateway, amount, fee, transactionId, InvoiceTransactionStatus.Processing);
    }

    static addFailedPayment(invoice: Invoice | number, gateway: string, amount: number, fee: number | null = null, transactionId: string | null = null) {
        return this.addPayment(invoice, gateway, amount, fee, transactionId, InvoiceTransactionStatus.Failed);
    }

    static async addPaymentFee(transactionId: string, fee: number) {
        const t = await InvoiceTransaction.query().where('transaction_id', transactionId).firstOrFail();
        t.fee = fee;
        await t.save();
        return t;
    }

    /* ---------------- refunds ---------------- */

    /** Refund a transaction through the payment gateway, then record it locally. */
    static async refund(invoiceTransaction: InvoiceTransaction, amount: number): Promise<boolean> {
        if (!(amount > 0)) throw new Error('Refund amount must be greater than 0.');
        const gateway = await invoiceTransaction.rel('gateway');
        if (!gateway || !(await this.hasFunction(gateway, 'supportsRefunds')) || !(await this.hasFunction(gateway, 'refund'))) {
            throw new Error(`Gateway does not support refunds for transaction #${invoiceTransaction.id}`);
        }
        const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
        if (!instance.supportsRefunds()) throw new Error(`Gateway does not support refunds for transaction #${invoiceTransaction.id}`);

        return transaction(async () => {
            const locked = await InvoiceTransaction.query().where('id', invoiceTransaction.id).lockForUpdate().firstOrFail();
            this.assertRefundable(locked, amount);
            const success = await instance.refund(locked, amount);
            if (!success) throw new Error(`Gateway refund failed for transaction #${locked.id}`);
            return this.recordRefund(locked, amount);
        });
    }

    /** Record a refund without contacting the payment gateway. */
    static async refundLocally(invoiceTransaction: InvoiceTransaction, amount: number): Promise<void> {
        if (!(amount > 0)) throw new Error('Refund amount must be greater than 0.');
        await transaction(async () => {
            const locked = await InvoiceTransaction.query().where('id', invoiceTransaction.id).lockForUpdate().firstOrFail();
            this.assertRefundable(locked, amount);
            await this.recordRefund(locked, amount);
        });
    }

    private static assertRefundable(locked: InvoiceTransaction, amount: number) {
        const refundable = locked.refundableAmount();
        if (Math.round(amount * 100) > Math.round(refundable * 100)) {
            throw new Error(`Refund amount (${amount}) exceeds refundable amount (${refundable}) for this transaction.`);
        }
    }

    /** Raise the refunded amount of the transaction and add a credit note for it on the invoice. */
    private static async recordRefund(locked: InvoiceTransaction, amount: number): Promise<boolean> {
        const refunded = (Math.round(Number(locked.refunded_amount ?? 0) * 100) + Math.round(amount * 100)) / 100;
        locked.refunded_amount = refunded;
        await locked.save();
        const invoice = await locked.rel('invoice');
        await invoice.relation('adjustmentNotes').create({
            type: AdjustmentNoteType.Credit,
            amount: -1 * Math.abs(amount),
            description: `Refund for transaction #${locked.id} (${locked.transaction_id ?? 'manual'})`,
        });
        return true;
    }

    static async cancelSubscription(service: Service): Promise<boolean> {
        for (const gateway of await Gateway.all<Gateway>()) {
            const instance = (await this.getExtension('gateway', gateway.extension, await gateway.rel('settings'))) as any;
            if (typeof instance.cancelSubscription === 'function' && (await instance.cancelSubscription(service))) return true;
        }
        return false;
    }

    /* ---------------- servers ---------------- */

    static async getServiceProperties(service: Service): Promise<Record<string, any>> {
        const properties: Record<string, any> = {};
        for (const p of await service.rel('properties')) properties[p.key] = p.value;
        for (const config of await service.rel('configs')) {
            const option = await config.rel('configOption');
            const value = await config.rel('configValue');
            properties[option!.env_variable ?? ''] = value?.env_variable ?? value?.name;
        }
        return properties;
    }

    protected static async checkServer(service: Service, action: string): Promise<Extension> {
        const product = (await service.rel('product'))!;
        const server = await product.rel('server');
        if (!server) throw new Error('No server assigned to this product');
        // Does server support this action?
        if (!(await this.hasFunction(server, action))) throw new Error(`Server does not support the action: ${action}`);
        return server;
    }

    protected static async recordAudit(model: Service, action: string, oldValues: Record<string, unknown> = {}, newValues: Record<string, unknown> = {}) {
        await recordAudit(model, 'extension_action', { old: oldValues, new: newValues });
        void action;
    }

    private static async serverCall(service: Service, fn: string, auditAction?: string): Promise<any> {
        const server = await this.checkServer(service, fn);
        if (auditAction) await this.recordAudit(service, 'extension_action', {}, { action: auditAction });
        const product = (await service.rel('product'))!;
        const instance = (await this.getExtension('server', server.extension, await server.rel('settings'))) as any;
        return instance[fn](service, settingsToArray(await product.rel('settings')), await this.getServiceProperties(service));
    }

    static createServer(service: Service) { return this.serverCall(service, 'createServer', 'create_server'); }
    static suspendServer(service: Service) { return this.serverCall(service, 'suspendServer', 'suspend_server'); }
    static unsuspendServer(service: Service) { return this.serverCall(service, 'unsuspendServer', 'unsuspend_server'); }
    static terminateServer(service: Service) { return this.serverCall(service, 'terminateServer', 'terminate_server'); }
    static upgradeServer(service: Service) { return this.serverCall(service, 'upgradeServer', 'upgrade_server'); }
    static getActions(service: Service) { return this.serverCall(service, 'getActions'); }

    static async getView(service: Service, view: { function?: string; name: string }) {
        const fn = view.function ?? 'getView';
        const server = await this.checkServer(service, fn);
        const product = (await service.rel('product'))!;
        const instance = (await this.getExtension('server', server.extension, await server.rel('settings'))) as any;
        return instance[fn](service, settingsToArray(await product.rel('settings')), await this.getServiceProperties(service), view.name);
    }

    /* ---------------- routes / events / migrations ---------------- */

    /** Routes contributed by all booted extensions. */
    static routes: Array<ExtensionRoute & { extension: string; type: string }> = [];
    static pages: Array<ExtensionPage & { extension: string; type: string }> = [];

    /** A fresh instance with the settings currently saved for the first installed row of this extension. */
    static async freshInstance<T = ExtensionBase>(type: string, name: string): Promise<T> {
        return (await this.getExtension(type, name)) as T;
    }

    static async bootExtensions() {
        const rows = await Extension.query()
            .where((q) => q.where('enabled', true).orWhere('type', 'server').orWhere('type', 'gateway'))
            .get();
        const seen = new Set<string>();
        this.routes = [];
        this.pages = [];
        for (const row of rows) {
            if (seen.has(row.extension)) continue;
            seen.add(row.extension);
            try {
                const instance = (await this.getExtension(row.type, row.extension, await row.rel('settings'))) as ExtensionBase;
                await instance.boot?.();
                for (const r of instance.routes?.() ?? []) {
                    this.routes.push({ ...r, extension: row.extension, type: row.type });
                    if (r.name) (await import('@/server/routes')).registerRoute(r.name, r.path);
                }
                for (const endpoint of instance.apiEndpoints?.() ?? []) {
                    (await import('@/server/api/admin')).registerEndpoint({ ...endpoint, extension: row.extension });
                }
                for (const p of instance.pages?.() ?? []) {
                    this.pages.push({ ...p, extension: row.extension, type: row.type });
                    if (p.name) (await import('@/server/routes')).registerRoute(p.name, p.path);
                }
            } catch (e: any) {
                if (!String(e?.message ?? '').endsWith('not found')) console.error(`[extension:${row.extension}] boot failed:`, e?.message ?? e);
            }
        }
    }

    /** Run extension SQL migrations (`<extension>/database/migrations/*.sql`) through the shared `migrations` table. */
    static async runMigrations(relativePath: string): Promise<string[]> {
        // turbopackIgnore: the path is only known at runtime; without it the build traces (reads) the whole project directory
        const dir = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);
        if (!fs.existsSync(dir)) return [];
        const files = fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
        const { charset, collation } = dbConfig();
        const pool = getPool();
        const [rows] = (await pool.query('select migration from migrations')) as any;
        const done = new Set<string>(rows.map((r: any) => r.migration));
        const [[b]] = (await pool.query('select coalesce(max(batch),0) as b from migrations')) as any;
        const ran: string[] = [];
        for (const f of files) {
            const name = f.replace(/\.sql$/, '');
            if (done.has(name)) continue;
            const text = fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, f), 'utf8').replaceAll('{{charset}}', charset).replaceAll('{{collation}}', `'${collation}'`);
            for (const stmt of text.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, '')).filter(Boolean)) await pool.query(stmt);
            await pool.query('insert into migrations (migration, batch) values (?, ?)', [name, Number(b.b ?? b) + 1]);
            ran.push(name);
        }
        return ran;
    }

    /** Roll back extension migrations: each `<name>.down.sql` is applied in reverse order. */
    static async rollbackMigrations(relativePath: string): Promise<void> {
        const dir = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort().reverse();
        const pool = getPool();
        for (const f of files) {
            const name = f.replace(/\.sql$/, '');
            const down = path.join(/* turbopackIgnore: true */ dir, `${name}.down.sql`);
            const [rows] = (await pool.query('select 1 from migrations where migration = ?', [name])) as any;
            if (!rows.length) continue;
            if (fs.existsSync(down)) {
                for (const stmt of fs.readFileSync(down, 'utf8').split(/;\s*\n/).map((s) => s.trim().replace(/;$/, '')).filter(Boolean)) await pool.query(stmt);
            }
            await pool.query('delete from migrations where migration = ?', [name]);
        }
    }
}

void migrationsPath;
void currentDb;
void sql;
