import { config } from './config';
import { decryptCookie, encryptCookie } from './lib/crypto';

/**
 * Cookies written by the PHP release are encrypted with `EncryptCookies`; we read
 * those (and plain values) and write the same format, so carts and "remember me"
 * sessions survive the migration.
 */
async function jar() {
    const { cookies } = await import('next/headers');
    return cookies();
}

export async function getCookie(name: string): Promise<string | null> {
    try {
        const raw = (await jar()).get(name)?.value;
        if (!raw) return null;
        const value = decodeURIComponent(raw);
        const plain = decryptCookie(name, value);
        // Accept un-encrypted legacy values (e.g. a bare ULID)
        return plain ?? (/^[0-9a-z]{26}$/i.test(value) ? value : null);
    } catch {
        return null;
    }
}

export async function hasCookie(name: string): Promise<boolean> {
    return (await getCookie(name)) !== null;
}

export async function setCookie(
    name: string,
    value: string,
    options: { minutes?: number; httpOnly?: boolean; encrypt?: boolean } = {},
): Promise<void> {
    try {
        const c = await jar();
        const secure = String(config('app.url', '')).startsWith('https://');
        const v = options.encrypt === false ? value : encryptCookie(name, value);
        c.set(name, encodeURIComponent(v), {
            httpOnly: options.httpOnly ?? true,
            sameSite: 'lax',
            secure,
            path: '/',
            maxAge: options.minutes ? options.minutes * 60 : undefined,
        });
    } catch {
        /* cookies are read-only during page rendering */
    }
}

export async function forgetCookie(name: string): Promise<void> {
    try {
        (await jar()).set(name, '', { path: '/', maxAge: 0 });
    } catch {
        /* ignore */
    }
}
