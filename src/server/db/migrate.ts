import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { dbConfig, getPool } from './connection';
import { afterMigration } from './migration-handlers';

/**
 * Migration runner compatible with Laravel's `migrations` table, so a database
 * created by the PHP release can be adopted in place and vice versa:
 * every file in ./migrations is recorded under its Laravel name.
 */

export interface MigrationStatus {
    name: string;
    batch: number | null;
}

export function migrationsPath(): string {
    return path.join(process.cwd(), 'migrations');
}

export function listMigrationFiles(): string[] {
    return fs
        .readdirSync(migrationsPath())
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f.replace(/\.sql$/, ''))
        .sort();
}

async function ensureMigrationsTable(pool: Pool) {
    const { charset, collation } = dbConfig();
    await pool.query(
        `create table if not exists \`migrations\` (
            \`id\` int unsigned not null auto_increment primary key,
            \`migration\` varchar(255) not null,
            \`batch\` int not null
        ) default character set ${charset} collate '${collation}'`,
    );
}

export async function migrationStatus(pool: Pool = getPool()): Promise<MigrationStatus[]> {
    await ensureMigrationsTable(pool);
    const [rows] = await pool.query<RowDataPacket[]>('select migration, batch from migrations');
    const applied = new Map<string, number>(rows.map((r) => [r.migration as string, r.batch as number]));
    return listMigrationFiles().map((name) => ({ name, batch: applied.get(name) ?? null }));
}

function statementsFor(name: string): string[] {
    const { charset, collation } = dbConfig();
    const sql = fs
        .readFileSync(path.join(migrationsPath(), `${name}.sql`), 'utf8')
        .replaceAll('{{charset}}', charset)
        .replaceAll('{{collation}}', `'${collation}'`);
    // one statement per line, each terminated by `;`
    return sql
        .split(/;\s*\n/)
        .map((s) => s.trim().replace(/;$/, ''))
        .filter(Boolean);
}

export async function migrate(options: { log?: (msg: string) => void } = {}): Promise<string[]> {
    const log = options.log ?? (() => {});
    const pool = getPool();
    await ensureMigrationsTable(pool);

    const status = await migrationStatus(pool);
    const pending = status.filter((s) => s.batch === null).map((s) => s.name);
    if (pending.length === 0) {
        log('Nothing to migrate.');
        return [];
    }

    const [[row]] = await pool.query<RowDataPacket[]>('select coalesce(max(batch), 0) as b from migrations');
    const batch = Number(row.b) + 1;

    const conn: PoolConnection = await pool.getConnection();
    try {
        for (const name of pending) {
            const started = Date.now();
            for (const statement of statementsFor(name)) {
                await conn.query(statement);
            }
            const after = afterMigration[name];
            if (after) await after(conn);
            await conn.query('insert into migrations (migration, batch) values (?, ?)', [name, batch]);
            log(`  ${name} ${'.'.repeat(Math.max(2, 78 - name.length))} ${Date.now() - started}ms DONE`);
        }
    } finally {
        conn.release();
    }
    return pending;
}

/** Drops every table in the database (used by `migrate:fresh`). */
export async function dropAllTables(): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
        'select table_name as t from information_schema.tables where table_schema = database()',
    );
    const conn = await pool.getConnection();
    try {
        await conn.query('set foreign_key_checks = 0');
        for (const r of rows) await conn.query(`drop table if exists \`${r.t}\``);
        await conn.query('set foreign_key_checks = 1');
    } finally {
        conn.release();
    }
}
