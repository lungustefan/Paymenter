import { sql } from 'drizzle-orm';
import { envString } from '@/server/env';
import { currentDb } from '@/server/orm';
import { Http } from '@/server/http';
import { Settings } from '@/server/classes/Settings';
import { appVersion } from '@/server/version';

async function count(table: string, where = ''): Promise<number> {
    const [rows] = (await currentDb().execute(sql.raw(`select count(*) as c from \`${table}\` ${where}`))) as any;
    return Number(rows[0].c);
}

async function pluck(query: string): Promise<string[]> {
    const [rows] = (await currentDb().execute(sql.raw(query))) as any;
    return rows.map((r: any) => Object.values(r)[0] as string);
}

/** Port of `app:telemetry` (anonymous usage statistics). */
export async function telemetry(simulate: boolean, info: (m: string) => void = console.log) {
    info('Gathering telemetry data...');
    const [[version]] = (await currentDb().execute(sql.raw('select version() as v'))) as any;
    const data = {
        uuid: (await Settings.getTelemetry()).uuid,
        version: appVersion(),
        php_version: `node ${process.versions.node}`,
        drivers: {
            cache: { type: envString('CACHE_STORE', 'file') },
            database: { type: envString('DB_CONNECTION', 'mariadb'), version: version.v },
        },
        database_counts: {
            invoices: { count: await count('invoices'), paid: await count('invoices', "where status = 'paid'") },
            services: { count: await count('services'), active: await count('services', "where status = 'active'") },
            products: { count: await count('products') },
            currencies: { count: await count('currencies'), currencies: await pluck('select code from currencies') },
            users: { count: await count('users'), admins: await count('users', 'where role_id is not null') },
            extensions: {
                count: await count('extensions'),
                active: await pluck("select extension from extensions where enabled = 1 or type in ('server', 'gateway')"),
            },
        },
    };

    if (simulate) {
        info('Simulating telemetry data...');
        info(JSON.stringify(data, null, 4));
        return;
    }

    info('Sending telemetry data...');
    const response = (await Http.post('https://api.paymenter.org/statistics', data)).throw();
    if (response.successful()) info('Telemetry data sent successfully.');
    else console.error(`Failed to send telemetry data: ${response.body()}`);
}
