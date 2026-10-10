import { config } from './config';
import { decryptCookie, encryptCookie } from './lib/crypto';
import { requestScope } from './request-store';

/**
 * Encrypted cookie session. Equivalent of Laravel's session for the handful of
 * values the app keeps (currency, locale, user_session, impersonating, 2fa,
 * gateway, login_ip / login_ua ...). The identity itself lives in the
 * `user_sessions` table; the cookie only carries the ULID.
 *
 * Cookies can only be written from server actions / route handlers / proxy;
 * writes during page rendering are kept in the request scope only.
 */
export const SESSION_COOKIE = 'paymenter_session';

type Data = Record<string, any>;

async function jar() {
    const { cookies } = await import('next/headers');
    return cookies();
}

async function load(): Promise<Data> {
    const scope = await requestScope();
    if (scope.has('session')) return scope.get('session') as Data;
    let data: Data = {};
    try {
        const raw = (await jar()).get(SESSION_COOKIE)?.value;
        if (raw) {
            const plain = decryptCookie(SESSION_COOKIE, decodeURIComponent(raw));
            if (plain) data = JSON.parse(plain);
        }
    } catch {
        /* no request / invalid cookie */
    }
    scope.set('session', data);
    return data;
}

async function persist(data: Data) {
    try {
        const c = await jar();
        const secure = String(config('app.url', '')).startsWith('https://');
        c.set(SESSION_COOKIE, encodeURIComponent(encryptCookie(SESSION_COOKIE, JSON.stringify(data))), {
            httpOnly: true,
            sameSite: 'lax',
            secure,
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
        });
    } catch {
        /* immutable context (page render) */
    }
}

export async function sessionGet<T = any>(key: string, fallback: T | null = null): Promise<T> {
    const data = await load();
    return (key in data ? data[key] : fallback) as T;
}

export async function sessionHas(key: string): Promise<boolean> {
    return key in (await load());
}

export async function sessionPut(key: string, value: unknown): Promise<void> {
    const data = await load();
    data[key] = value;
    await persist(data);
}

export async function sessionForget(...keys: string[]): Promise<void> {
    const data = await load();
    for (const k of keys) delete data[k];
    await persist(data);
}

export async function sessionFlush(): Promise<void> {
    const scope = await requestScope();
    scope.set('session', {});
    await persist({});
}
