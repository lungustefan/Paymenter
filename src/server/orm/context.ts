import { AsyncLocalStorage } from 'node:async_hooks';
import { db, type Database } from '@/server/db';

/**
 * Ambient execution context. A transaction started with `transaction()` is
 * visible to every query issued (directly or indirectly) inside the callback,
 * which mirrors how `DB::transaction()` works in Laravel.
 */
export interface DbContext {
    tx?: Database;
    afterCommit: Array<() => void | Promise<void>>;
    depth: number;
}

export const dbContext = new AsyncLocalStorage<DbContext>();

export function currentDb(): Database {
    return dbContext.getStore()?.tx ?? db;
}

export function inTransaction(): boolean {
    return !!dbContext.getStore()?.tx;
}

/** Run `fn` inside a database transaction (nested calls use savepoints). */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const parent = dbContext.getStore();
    const conn = currentDb();
    if (parent?.tx) {
        return (conn as any).transaction(async (tx: Database) => {
            return dbContext.run({ ...parent, tx, depth: parent.depth + 1 }, fn);
        });
    }
    const store: DbContext = { afterCommit: [], depth: 1 };
    const result = await (conn as any).transaction(async (tx: Database) => {
        return dbContext.run({ ...store, tx }, fn);
    });
    // Committed: flush afterCommit callbacks
    for (const cb of store.afterCommit) await cb();
    return result;
}

/** `DB::afterCommit()` - runs immediately when no transaction is open. */
export async function afterCommit(cb: () => void | Promise<void>): Promise<void> {
    const store = dbContext.getStore();
    if (store?.tx) {
        store.afterCommit.push(cb);
        return;
    }
    await cb();
}
