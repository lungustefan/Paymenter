import { envBool, envString } from '@/server/env';
import { dataGet, dataSet } from '@/server/lib/php';
import { appCommit, appVersion } from '@/server/version';

/**
 * Runtime configuration (Laravel's `config()` for the keys the app uses).
 * Values start from the environment and are overridden by the `settings`
 * table once it is loaded (see `settings/store.ts`).
 */

function defaults(): Record<string, any> {
    return {
        app: {
            name: envString('APP_NAME', 'Paymenter'),
            version: appVersion(),
            commit: appCommit(),
            telemetry_enabled: envBool('TELEMETRY_ENABLED', true),
            env: envString('APP_ENV', 'production'),
            debug: envBool('APP_DEBUG', false),
            url: envString('APP_URL', 'http://localhost'),
            timezone: envString('APP_TIMEZONE', 'UTC'),
            locale: envString('APP_LOCALE', 'en'),
            fallback_locale: envString('APP_FALLBACK_LOCALE', 'en'),
        },
        mail: {
            default: envString('MAIL_MAILER', 'smtp'),
            mailers: {
                smtp: {
                    host: envString('MAIL_HOST', '127.0.0.1'),
                    port: Number(envString('MAIL_PORT', '2525')),
                    encryption: envString('MAIL_ENCRYPTION', 'tls') || null,
                    username: envString('MAIL_USERNAME') || null,
                    password: envString('MAIL_PASSWORD') || null,
                },
            },
            from: {
                address: envString('MAIL_FROM_ADDRESS', 'hello@example.com'),
                name: envString('MAIL_FROM_NAME', 'Example'),
            },
        },
        session: {
            lifetime: Number(envString('SESSION_LIFETIME', '120')),
            lottery: [2, 100] as [number, number],
        },
        auth: { verification: { expire: 60 } },
        settings: {} as Record<string, any>,
    };
}

const g = globalThis as unknown as { __paymenterConfig?: Record<string, any> };

function store(): Record<string, any> {
    return (g.__paymenterConfig ??= defaults());
}

/** `config('app.name', default)` */
export function config<T = any>(path: string, fallback: T | null = null): T {
    const v = dataGet(store(), path, undefined);
    return (v === undefined ? fallback : v) as T;
}

export function setConfig(path: string, value: unknown) {
    dataSet(store(), path, value);
}

export function resetConfig() {
    g.__paymenterConfig = defaults();
}

/** `config('settings.<key>', default)` - synchronous read of the settings snapshot. */
export function setting<T = any>(key: string, fallback: T | null = null): T {
    const v = store().settings[key];
    return (v === undefined ? fallback : v) as T;
}

export function allSettings(): Record<string, any> {
    return store().settings;
}

export function replaceSettings(next: Record<string, any>) {
    store().settings = next;
}
