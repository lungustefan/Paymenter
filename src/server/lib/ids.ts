import crypto from 'node:crypto';

const ENCODING = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32 (lowercase, as `HasUlids` stores it)

let lastTime = 0;
let lastRandom: number[] = [];

/** Generate a ULID (monotonic within the same millisecond), lowercase like Laravel's `HasUlids`. */
export function ulid(time: number = Date.now()): string {
    let timePart = '';
    let t = time;
    for (let i = 0; i < 10; i++) {
        timePart = ENCODING[t % 32] + timePart;
        t = Math.floor(t / 32);
    }

    let random: number[];
    if (time === lastTime && lastRandom.length) {
        random = [...lastRandom];
        for (let i = 15; i >= 0; i--) {
            if (random[i] < 31) {
                random[i]++;
                break;
            }
            random[i] = 0;
        }
    } else {
        random = Array.from(crypto.randomBytes(16), (b) => b % 32);
    }
    lastTime = time;
    lastRandom = random;
    return timePart + random.map((r) => ENCODING[r]).join('');
}

export function uuid(): string {
    return crypto.randomUUID();
}

/** `Str::random(n)` - alphanumeric. */
export function randomString(length = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    while (out.length < length) {
        const bytes = crypto.randomBytes(length * 2);
        for (const b of bytes) {
            if (b < 248) out += chars[b % 62];
            if (out.length === length) break;
        }
    }
    return out;
}

/** `Str::password()` - mix of letters, numbers and symbols. */
export function randomPassword(length = 32): string {
    const sets = ['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '~!#$%^&*()-_.,<>?/\\{}[]|:;'];
    const all = sets.join('');
    let out = '';
    while (out.length < length) {
        const bytes = crypto.randomBytes(2);
        out += all[bytes.readUInt16BE(0) % all.length];
    }
    return out;
}
