import { beforeEach } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';

/**
 * Equivalent of `RefreshDatabase` + `$seed = true`: before every test all tables are emptied
 * (except the migration bookkeeping) and the seeder runs again, so tests never see each other's rows.
 */
export async function resetDatabase() {
    const { getPool } = await import('@/server/db/connection');
    const { seed } = await import('@/server/db/seed');
    const { cacheFlush } = await import('@/server/cache');
    const { flushSettingsCache, ensureSettings } = await import('@/server/settings/store');
    const { resetConfig } = await import('@/server/config');

    const conn = await getPool().getConnection();
    try {
        const [rows] = await conn.query<RowDataPacket[]>('select table_name as t from information_schema.tables where table_schema = database() and table_type = "BASE TABLE"');
        await conn.query('set foreign_key_checks = 0');
        for (const r of rows) {
            if (r.t === 'migrations') continue;
            await conn.query(`truncate table \`${r.t}\``);
        }
        await conn.query('set foreign_key_checks = 1');
    } finally {
        conn.release();
    }

    resetConfig();
    await cacheFlush();
    await seed();
    await flushSettingsCache();
    await ensureSettings(true);
    // listeners / observers (once per process)
    await (await import('@/server/bootstrap')).boot();
}

/** Call at the top of a test file that touches the database. */
export function useDatabase() {
    beforeEach(async () => {
        await resetDatabase();
    });
}
