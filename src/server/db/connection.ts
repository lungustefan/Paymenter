import fs from 'node:fs';
import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import { envInt, envString } from '@/server/env';

/**
 * Connection settings. Mirrors the variables of the original `.env`
 * (DB_CONNECTION, DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD, DB_SOCKET, DB_URL, DB_COLLATION).
 */
export function dbConfig(): PoolOptions & { collation: string; charset: string } {
    const connection = envString('DB_CONNECTION', 'mariadb');
    const url = envString('DB_URL');
    let host = envString('DB_HOST', '127.0.0.1');
    let port = envInt('DB_PORT', 3306);
    let user = envString('DB_USERNAME', 'paymenter');
    let password = envString('DB_PASSWORD', '');
    let database = envString('DB_DATABASE', 'paymenter');

    if (url) {
        const u = new URL(url);
        host = u.hostname || host;
        port = u.port ? Number(u.port) : port;
        user = decodeURIComponent(u.username || user);
        password = decodeURIComponent(u.password || password);
        database = u.pathname.replace(/^\//, '') || database;
    }

    const collation = envString('DB_COLLATION', connection === 'mysql' ? 'utf8mb4_0900_ai_ci' : 'utf8mb4_uca1400_ai_ci');
    const ca = envString('MYSQL_ATTR_SSL_CA');
    const socketPath = envString('DB_SOCKET');

    return {
        ...(socketPath ? { socketPath } : { host, port }),
        user,
        password,
        database,
        charset: 'utf8mb4',
        collation,
        // Timestamps are kept as wall-clock strings (see src/server/db/types.ts)
        dateStrings: true,
        decimalNumbers: true,
        supportBigNumbers: true,
        bigNumberStrings: false,
        waitForConnections: true,
        connectionLimit: envInt('DB_POOL_SIZE', 10),
        ...(ca ? { ssl: { ca: fs.readFileSync(ca, 'utf8') } } : {}),
    };
}

const g = globalThis as unknown as { __paymenterPool?: Pool };

/** Lazily-created singleton pool (survives HMR in dev). */
export function getPool(): Pool {
    if (!g.__paymenterPool) {
        const { collation: _collation, ...opts } = dbConfig();
        g.__paymenterPool = mysql.createPool(opts);
    }
    return g.__paymenterPool;
}

export async function closePool() {
    if (g.__paymenterPool) {
        await g.__paymenterPool.end();
        g.__paymenterPool = undefined;
    }
}
