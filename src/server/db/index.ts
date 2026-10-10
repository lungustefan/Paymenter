import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from './schema';
import { getPool } from './connection';

export type Database = MySql2Database<typeof schema>;

const g = globalThis as unknown as { __paymenterDb?: Database };

function create(): Database {
    return drizzle(getPool(), { schema, mode: 'default' });
}

/** Lazily-created Drizzle instance. Importing this module never opens a connection. */
export const db: Database = new Proxy({} as Database, {
    get(_target, prop, receiver) {
        g.__paymenterDb ??= create();
        return Reflect.get(g.__paymenterDb, prop, receiver);
    },
});

export { schema };
export * from './schema';
