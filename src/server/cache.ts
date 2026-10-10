import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { envString } from '@/server/env';

/**
 * Cache with the same drivers the original supports through CACHE_STORE:
 * `redis`, `file`, `database`-less fallbacks (`array`). Falls back to an
 * in-process store when Redis is not reachable so a missing Redis never takes
 * the site down.
 */
interface Store {
    get(key: string): Promise<any>;
    put(key: string, value: any, ttlSeconds?: number): Promise<void>;
    forget(key: string): Promise<void>;
    flush(): Promise<void>;
}

class ArrayStore implements Store {
    private data = new Map<string, { v: any; exp: number | null }>();
    async get(key: string) {
        const e = this.data.get(key);
        if (!e) return null;
        if (e.exp !== null && e.exp < Date.now()) {
            this.data.delete(key);
            return null;
        }
        return e.v;
    }
    async put(key: string, value: any, ttl?: number) {
        this.data.set(key, { v: value, exp: ttl ? Date.now() + ttl * 1000 : null });
    }
    async forget(key: string) {
        this.data.delete(key);
    }
    async flush() {
        this.data.clear();
    }
}

class FileStore implements Store {
    constructor(private dir: string) {
        fs.mkdirSync(dir, { recursive: true });
    }
    private file(key: string) {
        return path.join(this.dir, crypto.createHash('sha1').update(key).digest('hex'));
    }
    async get(key: string) {
        try {
            const { exp, v } = JSON.parse(fs.readFileSync(this.file(key), 'utf8'));
            if (exp !== null && exp < Date.now()) {
                fs.rmSync(this.file(key), { force: true });
                return null;
            }
            return v;
        } catch {
            return null;
        }
    }
    async put(key: string, value: any, ttl?: number) {
        fs.writeFileSync(this.file(key), JSON.stringify({ exp: ttl ? Date.now() + ttl * 1000 : null, v: value }));
    }
    async forget(key: string) {
        fs.rmSync(this.file(key), { force: true });
    }
    async flush() {
        for (const f of fs.readdirSync(this.dir)) fs.rmSync(path.join(this.dir, f), { force: true });
    }
}

class RedisStore implements Store {
    private client: any;
    private failed = false;
    private fallback = new ArrayStore();
    private prefix: string;
    constructor() {
        const name = envString('APP_NAME', 'laravel').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        this.prefix = envString('CACHE_PREFIX', `${name}_cache_`);
    }
    private async redis() {
        if (this.failed) return null;
        if (!this.client) {
            try {
                const { default: Redis } = await import('ioredis');
                this.client = new Redis({
                    host: envString('REDIS_HOST', '127.0.0.1'),
                    port: Number(envString('REDIS_PORT', '6379')),
                    password: envString('REDIS_PASSWORD') && envString('REDIS_PASSWORD') !== 'null' ? envString('REDIS_PASSWORD') : undefined,
                    lazyConnect: true,
                    maxRetriesPerRequest: 1,
                    retryStrategy: () => null,
                });
                this.client.on('error', () => {});
                await this.client.connect();
            } catch {
                this.failed = true;
                return null;
            }
        }
        return this.client;
    }
    async get(key: string) {
        const r = await this.redis();
        if (!r) return this.fallback.get(key);
        const v = await r.get(this.prefix + key);
        return v === null ? null : JSON.parse(v);
    }
    async put(key: string, value: any, ttl?: number) {
        const r = await this.redis();
        if (!r) return this.fallback.put(key, value, ttl);
        if (ttl) await r.set(this.prefix + key, JSON.stringify(value), 'EX', ttl);
        else await r.set(this.prefix + key, JSON.stringify(value));
    }
    async forget(key: string) {
        const r = await this.redis();
        if (!r) return this.fallback.forget(key);
        await r.del(this.prefix + key);
    }
    async flush() {
        const r = await this.redis();
        if (!r) return this.fallback.flush();
        const keys = await r.keys(`${this.prefix}*`);
        if (keys.length) await r.del(...keys);
    }
}

const g = globalThis as unknown as { __paymenterCache?: Store };

function store(): Store {
    if (g.__paymenterCache) return g.__paymenterCache;
    const driver = envString('CACHE_STORE', 'file');
    g.__paymenterCache =
        driver === 'redis' ? new RedisStore() : driver === 'array' ? new ArrayStore() : new FileStore(path.join(process.cwd(), 'storage', 'framework', 'cache', 'data'));
    void os;
    return g.__paymenterCache;
}

export const cacheGet = <T = any>(key: string): Promise<T | null> => store().get(key);
export const cachePut = (key: string, value: any, ttlSeconds?: number) => store().put(key, value, ttlSeconds);
export const cacheForget = (key: string) => store().forget(key);
export const cacheFlush = () => store().flush();

export async function cacheRemember<T>(key: string, ttlSeconds: number, fn: () => Promise<T> | T): Promise<T> {
    const hit = await cacheGet<T>(key);
    if (hit !== null && hit !== undefined) return hit;
    const value = await fn();
    await cachePut(key, value, ttlSeconds);
    return value;
}

/** Simple fixed-window rate limiter (Laravel's RateLimiter facade). */
export const RateLimiter = {
    async tooManyAttempts(key: string, maxAttempts: number): Promise<boolean> {
        const attempts = (await cacheGet<number>(`rl:${key}`)) ?? 0;
        return attempts >= maxAttempts;
    },
    async hit(key: string, decaySeconds = 60): Promise<number> {
        const k = `rl:${key}`;
        const attempts = ((await cacheGet<number>(k)) ?? 0) + 1;
        const existingExp = (await cacheGet<number>(`${k}:exp`)) ?? Date.now() + decaySeconds * 1000;
        await cachePut(`${k}:exp`, existingExp, decaySeconds);
        await cachePut(k, attempts, Math.max(1, Math.ceil((existingExp - Date.now()) / 1000)));
        return attempts;
    },
    async availableIn(key: string): Promise<number> {
        const exp = await cacheGet<number>(`rl:${key}:exp`);
        return exp ? Math.max(0, Math.ceil((exp - Date.now()) / 1000)) : 0;
    },
    async clear(key: string) {
        await cacheForget(`rl:${key}`);
        await cacheForget(`rl:${key}:exp`);
    },
};
