import { describe, expect, it, vi } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';
import { useDatabase } from '../helpers/db';
import { importFromWhmcs } from '@/server/commands/import-from-whmcs';
import { getPool } from '@/server/db/connection';
import { Carbon } from '@/server/lib/carbon';

/** the WHMCS database the importer reads: table name -> rows (tables that are not listed are empty) */
const whmcs = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }));

// The WHMCS connection answers the queries of the importer from `whmcs.tables`; the Paymenter database is the real test database.
vi.mock('mysql2/promise', async (importOriginal) => {
    // the importer and the pool of the app use the default export (`mysql.createConnection()`, `mysql.createPool()`)
    const actual = await importOriginal<Record<string, any>>();
    const createConnection = async () => ({
        async query(sql: string, params: unknown[] = []) {
            const rows = whmcs.tables[/\bFROM (\w+)/i.exec(sql)![1]] ?? [];
            if (/^SELECT COUNT\(\*\)/i.test(sql)) return [[{ count: rows.length }], []];
            if (/LIMIT \? OFFSET \?$/.test(sql)) {
                const [limit, offset] = params as number[];
                return [rows.slice(offset, offset + limit), []];
            }
            if (/WHERE id = \? LIMIT 1$/.test(sql)) return [rows.filter((r) => r.id == params[0]).slice(0, 1), []];
            // lookups of related records (pricing, upgrades, config option links): nothing in this database
            return [[], []];
        },
        async end() {},
    });
    return { ...actual, default: { ...actual.default, createConnection } };
});

describe('ImportFromWhmcs', () => {
    useDatabase();

    const product = (id: number, created_at: unknown, updated_at: unknown) => ({ id, gid: 1, name: `Product ${id}`, description: '', slug: `product-${id}`, hidden: 0, stockcontrol: 0, qty: 0, allowqty: 0, paytype: 'free', created_at, updated_at });

    it('imports products whose dates are invalid with the current date', async () => {
        whmcs.tables = {
            tblcurrencies: [{ id: 1, code: 'USD', prefix: '$', suffix: ' USD', format: 1, default: 1 }],
            tblproductgroups: [{ id: 1, name: 'Hosting', tagline: '', order: 0, slug: 'hosting', created_at: '2024-01-01 00:00:00', updated_at: '2024-01-01 00:00:00' }],
            // WHMCS leaves the timestamps of products created by old versions at the zero date
            tblproducts: [product(1, '0000-00-00 00:00:00', ''), product(2, '2024-03-01 10:00:00', '2024-03-02 11:30:00')],
        };
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const before = Carbon.now().subSeconds(5).toDateTimeString();
        try {
            await importFromWhmcs({ dbname: 'whmcs', username: 'whmcs', host: '127.0.0.1', port: '3306' }, { text: async () => '', password: async () => '' }, () => {});
        } finally {
            log.mockRestore();
        }

        const [rows] = await getPool().query<RowDataPacket[]>('select id, created_at, updated_at from products order by id');
        expect(rows.map((r) => r.id)).toEqual([1, 2]);
        expect(rows[0].created_at >= before).toBe(true);
        expect(rows[0].updated_at >= before).toBe(true);
        expect(rows[1].created_at).toBe('2024-03-01 10:00:00');
        expect(rows[1].updated_at).toBe('2024-03-02 11:30:00');
    });
});
