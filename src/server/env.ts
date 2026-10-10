import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

let loaded = false;

/**
 * Loads `.env`, `.env.local`, ... exactly like Next.js does. Next already does
 * this for the web process; the CLI / worker call it explicitly.
 */
export function loadEnv() {
    if (loaded) return;
    loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
    loaded = true;
}

/**
 * Laravel-style `env()`: understands the `true`/`false`/`null`/`empty`
 * literals so an existing `.env` file keeps working unchanged.
 */
export function env(key: string): string | boolean | null | undefined;
export function env<T>(key: string, fallback: T): string | boolean | null | T;
export function env(key: string, fallback?: unknown) {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    switch (raw.toLowerCase()) {
        case 'true':
        case '(true)':
            return true;
        case 'false':
        case '(false)':
            return false;
        case 'empty':
        case '(empty)':
            return '';
        case 'null':
        case '(null)':
            return null;
    }
    // strip surrounding quotes some dotenv flavours leave behind
    return raw.replace(/^(["'])(.*)\1$/, '$2');
}

export function envString(key: string, fallback = ''): string {
    const v = env(key);
    return v === undefined || v === null || typeof v === 'boolean' ? fallback : String(v);
}

export function envBool(key: string, fallback = false): boolean {
    const v = env(key);
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    return ['1', 'yes', 'on'].includes(v.toLowerCase());
}

export function envInt(key: string, fallback: number): number {
    const v = Number.parseInt(envString(key), 10);
    return Number.isFinite(v) ? v : fallback;
}
