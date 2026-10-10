import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { currentDb } from '@/server/orm/context';
import { envString } from '@/server/env';
import { resolveMorph } from '@/server/orm/registry';
import { Model } from '@/server/orm';
import { flushTerminating } from '@/server/terminating';
import { jobs, failedJobs } from '@/server/db/schema';
import { Carbon } from '@/server/lib/carbon';
import { setListenerQueueDispatcher, getNamedListener } from '@/server/events';

/**
 * Database-backed queue on the existing `jobs` / `failed_jobs` tables, with the
 * same semantics the original app used: reserve with a row lock, retry after a
 * timeout, move to `failed_jobs` once `tries` is exhausted.
 *
 * `QUEUE_CONNECTION=sync` executes jobs inline. Both `redis` and `database`
 * map to the database queue (Redis stays available for the cache).
 */

export interface JobContext {
    uuid: string;
    attempts: number;
}

export interface JobDefinition<P = any> {
    handle: (payload: P, ctx: JobContext) => Promise<void> | void;
    tries?: number;
    timeout?: number;
    backoff?: number;
}

const registry = new Map<string, JobDefinition>();

export function registerJob<P = any>(name: string, def: JobDefinition<P>) {
    registry.set(name, def);
}

export function queueConnection(): 'sync' | 'database' {
    return envString('QUEUE_CONNECTION', 'database') === 'sync' ? 'sync' : 'database';
}

/* ---- payload (de)serialisation: models are stored by reference like SerializesModels ---- */

export function serialize(value: any): any {
    if (value instanceof Model) return { __model: value.ctor.morphName, id: value.getKey() };
    if (Array.isArray(value)) return value.map(serialize);
    if (value instanceof Carbon) return { __date: value.toISOString() };
    if (value && typeof value === 'object' && value.constructor === Object) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
    }
    return value;
}

export async function unserialize(value: any): Promise<any> {
    if (Array.isArray(value)) return Promise.all(value.map(unserialize));
    if (value && typeof value === 'object') {
        if ('__model' in value) {
            const ctor = resolveMorph(value.__model);
            return ctor ? ((await (ctor as any).query().find(value.id)) ?? null) : null;
        }
        if ('__date' in value) return new Carbon(new Date(value.__date));
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = await unserialize(v);
        return out;
    }
    return value;
}

export interface DispatchOptions {
    queue?: string;
    delaySeconds?: number;
    /** run inline even when a real queue is configured */
    sync?: boolean;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** `Job::dispatch(...)` */
export async function dispatchJob<P = any>(name: string, payload: P, options: DispatchOptions = {}): Promise<void> {
    const def = registry.get(name);
    if (!def) throw new Error(`Unknown job "${name}"`);
    const uuid = crypto.randomUUID();
    const body = {
        uuid,
        displayName: name,
        job: name,
        maxTries: def.tries ?? 1,
        timeout: def.timeout ?? 60,
        data: serialize(payload),
    };

    if (options.sync || queueConnection() === 'sync') {
        await runJob(def, await unserialize(body.data), { uuid, attempts: 1 });
        return;
    }

    await currentDb()
        .insert(jobs)
        .values({
            queue: options.queue ?? 'default',
            payload: JSON.stringify(body),
            attempts: 0,
            reserved_at: null,
            available_at: nowSec() + (options.delaySeconds ?? 0),
            created_at: nowSec(),
        } as any);
}

async function runJob(def: JobDefinition, payload: any, ctx: JobContext) {
    const timeout = (def.timeout ?? 60) * 1000;
    await Promise.race([
        Promise.resolve(def.handle(payload, ctx)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Job timed out after ${def.timeout ?? 60} seconds.`)), timeout).unref?.()),
    ]);
}

/* ---- queued event listeners ---- */

setListenerQueueDispatcher(async (listenerName, key, payload) => {
    await dispatchJob('listener', { listener: listenerName, event: key, payload });
});

registerJob('listener', {
    tries: 1,
    timeout: 120,
    async handle({ listener, payload }: { listener: string; event: string; payload: any }) {
        const fn = getNamedListener(listener);
        if (fn) await fn(payload);
    },
});

/* ---- worker ---- */

const RETRY_AFTER = 180;

async function reserve(queue: string) {
    const db = currentDb();
    return (db as any).transaction(async (tx: any) => {
        const now = nowSec();
        const [rows] = await tx.execute(sql`
            select * from ${jobs}
            where queue = ${queue}
              and ((reserved_at is null and available_at <= ${now}) or (reserved_at is not null and reserved_at <= ${now - RETRY_AFTER}))
            order by id asc limit 1 for update skip locked`);
        const row = (rows as any[])[0];
        if (!row) return null;
        await tx.execute(sql`update ${jobs} set reserved_at = ${now}, attempts = attempts + 1 where id = ${row.id}`);
        return { ...row, attempts: Number(row.attempts) + 1 };
    });
}

export async function failJob(row: any, error: Error) {
    const body = JSON.parse(row.payload);
    await currentDb().insert(failedJobs).values({
        uuid: body.uuid ?? crypto.randomUUID(),
        connection: 'database',
        queue: row.queue,
        payload: row.payload,
        exception: `${error.name}: ${error.message}\n${error.stack ?? ''}`,
        failed_at: Carbon.now(),
    } as any);
    await currentDb().execute(sql`delete from ${jobs} where id = ${row.id}`);
}

/** Process one job. Returns false when the queue is empty. */
export async function workOne(queue = 'default'): Promise<boolean> {
    const row = await reserve(queue);
    if (!row) return false;
    const body = JSON.parse(row.payload);
    const def = registry.get(body.job);
    try {
        if (!def) throw new Error(`Unknown job "${body.job}"`);
        const payload = await unserialize(body.data);
        await runJob(def, payload, { uuid: body.uuid, attempts: row.attempts });
        await currentDb().execute(sql`delete from ${jobs} where id = ${row.id}`);
    } catch (e: any) {
        console.error(`[queue] ${body.job} failed:`, e?.message ?? e);
        if (row.attempts >= (body.maxTries ?? 1)) {
            await failJob(row, e instanceof Error ? e : new Error(String(e)));
        } else {
            await currentDb().execute(
                sql`update ${jobs} set reserved_at = null, available_at = ${nowSec() + (def?.backoff ?? 0)} where id = ${row.id}`,
            );
        }
    } finally {
        await flushTerminating();
    }
    return true;
}

export async function work(options: { queue?: string; sleep?: number; stopWhenEmpty?: boolean; signal?: AbortSignal } = {}) {
    const queue = options.queue ?? 'default';
    const sleep = (options.sleep ?? 3) * 1000;
    while (!options.signal?.aborted) {
        const did = await workOne(queue);
        if (!did) {
            if (options.stopWhenEmpty) return;
            await new Promise((r) => setTimeout(r, sleep));
        }
    }
}

/** `queue:retry` - push a failed job back onto the queue. */
export async function retryFailedJob(uuid: string): Promise<boolean> {
    const [rows] = (await currentDb().execute(sql`select * from ${failedJobs} where uuid = ${uuid} limit 1`)) as any;
    const row = rows[0];
    if (!row) return false;
    await currentDb()
        .insert(jobs)
        .values({ queue: row.queue, payload: row.payload, attempts: 0, reserved_at: null, available_at: nowSec(), created_at: nowSec() } as any);
    await currentDb().execute(sql`delete from ${failedJobs} where id = ${row.id}`);
    return true;
}

/** `queue:restart` is a no-op: the worker reloads settings itself every few seconds. */
export async function restartQueue() {}
