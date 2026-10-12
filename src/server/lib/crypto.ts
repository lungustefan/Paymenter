import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { envInt, envString } from '@/server/env';

/**
 * Laravel-compatible cryptography, so data written by the PHP release
 * (encrypted settings, 2FA secrets, cookies, signed URLs) stays readable with
 * the same APP_KEY, and vice-versa.
 */

export class DecryptException extends Error {}

function parseKey(raw: string): Buffer {
    return raw.startsWith('base64:') ? Buffer.from(raw.slice(7), 'base64') : Buffer.from(raw);
}

export function appKeys(): Buffer[] {
    const current = envString('APP_KEY');
    if (!current) throw new Error('No application encryption key has been specified. Set APP_KEY in your .env file.');
    const previous = envString('APP_PREVIOUS_KEYS')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return [current, ...previous].map(parseKey);
}

function cipherFor(key: Buffer, hasTag: boolean): string {
    const bits = key.length * 8;
    if (key.length !== 16 && key.length !== 32) throw new Error('Unsupported cipher or incorrect key length.');
    return `aes-${bits}-${hasTag ? 'gcm' : 'cbc'}`;
}

function hmac(iv: string, value: string, key: Buffer): string {
    return crypto.createHmac('sha256', key).update(iv + value).digest('hex');
}

/** `Crypt::encryptString()` (no PHP serialization). */
export function encryptString(value: string, key: Buffer = appKeys()[0]): string {
    const gcm = envString('APP_CIPHER').toLowerCase().endsWith('gcm');
    const iv = crypto.randomBytes(gcm ? 12 : 16);
    const cipher = crypto.createCipheriv(cipherFor(key, gcm) as any, key, iv);
    let enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = gcm ? (cipher as crypto.CipherGCM).getAuthTag() : Buffer.alloc(0);
    const ivB64 = iv.toString('base64');
    const valueB64 = enc.toString('base64');
    const mac = gcm ? '' : hmac(ivB64, valueB64, key);
    const json = JSON.stringify({ iv: ivB64, value: valueB64, mac, tag: tag.toString('base64') });
    return Buffer.from(json).toString('base64');
}

export function decryptString(payload: string, keys: Buffer[] = appKeys()): string {
    let parsed: { iv?: string; value?: string; mac?: string; tag?: string };
    try {
        parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    } catch {
        throw new DecryptException('The payload is invalid.');
    }
    if (!parsed || !parsed.iv || !parsed.value || (parsed.mac === undefined && parsed.tag === undefined)) {
        throw new DecryptException('The payload is invalid.');
    }
    const hasTag = !!parsed.tag;
    for (const key of keys) {
        try {
            const iv = Buffer.from(parsed.iv, 'base64');
            if (!hasTag) {
                const expected = hmac(parsed.iv, parsed.value, key);
                const given = parsed.mac ?? '';
                if (expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) continue;
            }
            const decipher = crypto.createDecipheriv(cipherFor(key, hasTag) as any, key, iv);
            if (hasTag) (decipher as crypto.DecipherGCM).setAuthTag(Buffer.from(parsed.tag!, 'base64'));
            const dec = Buffer.concat([decipher.update(Buffer.from(parsed.value, 'base64')), decipher.final()]);
            return dec.toString('utf8');
        } catch {
            continue;
        }
    }
    throw new DecryptException('Could not decrypt the data.');
}

/* ---- cookies (EncryptCookies middleware compatible) ---- */

function cookiePrefix(name: string, key: Buffer): string {
    return crypto.createHmac('sha1', key).update(`${name}v2`).digest('hex') + '|';
}

export function encryptCookie(name: string, value: string): string {
    const key = appKeys()[0];
    return encryptString(cookiePrefix(name, key) + value, key);
}

export function decryptCookie(name: string, payload: string): string | null {
    for (const key of appKeys()) {
        try {
            const plain = decryptString(payload, [key]);
            const prefix = cookiePrefix(name, key);
            return plain.startsWith(prefix) ? plain.slice(prefix.length) : null;
        } catch {
            continue;
        }
    }
    return null;
}

/* ---- passwords ---- */

export function hashPassword(password: string, rounds = envInt('BCRYPT_ROUNDS', 12)): string {
    // bcryptjs emits $2b$; PHP's password_hash emits the equivalent $2y$.
    return bcrypt.hashSync(password, rounds).replace(/^\$2[ab]\$/, '$2y$');
}

export function checkPassword(password: string, hash: string): boolean {
    try {
        return bcrypt.compareSync(password, hash);
    } catch {
        return false;
    }
}

/* ---- signed URLs (URL::temporarySignedRoute compatible) ---- */

function signingKey(): Buffer {
    return appKeys()[0];
}

function buildQuery(params: Record<string, string | number>): string {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
}

export function signUrl(absoluteUrl: string, query: Record<string, string | number> = {}, expiresAt?: Date): string {
    const params: Record<string, string | number> = { ...query };
    if (expiresAt) params.expires = Math.floor(expiresAt.getTime() / 1000);
    const sorted = Object.fromEntries(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)));
    const qs = buildQuery(sorted);
    const original = qs ? `${absoluteUrl}?${qs}` : absoluteUrl;
    const signature = crypto.createHmac('sha256', signingKey()).update(original).digest('hex');
    return `${original}${qs ? '&' : '?'}signature=${signature}`;
}

export function hasValidSignature(absoluteUrlWithoutQuery: string, searchParams: URLSearchParams): boolean {
    const signature = searchParams.get('signature') ?? '';
    const rest = [...searchParams.entries()].filter(([k]) => k !== 'signature');
    const qs = rest.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const original = qs ? `${absoluteUrlWithoutQuery}?${qs}` : absoluteUrlWithoutQuery;
    for (const key of appKeys()) {
        const expected = crypto.createHmac('sha256', key).update(original).digest('hex');
        if (expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
            const expires = searchParams.get('expires');
            return !expires || Number(expires) > Math.floor(Date.now() / 1000);
        }
    }
    return false;
}

export function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function md5(value: string): string {
    return crypto.createHash('md5').update(value).digest('hex');
}

export function sha1(value: string): string {
    return crypto.createHash('sha1').update(value).digest('hex');
}

/** `php artisan key:generate` */
export function generateAppKey(): string {
    return 'base64:' + crypto.randomBytes(32).toString('base64');
}
