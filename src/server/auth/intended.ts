import { cookies } from 'next/headers';
import { baseUrl } from '@/server/routes';

/**
 * `url.intended`: the page a guest tried to open, remembered across the login.
 * Guests are bounced through `/auth/guest?to=...` (a route handler that is allowed to set cookies).
 */
export const INTENDED_COOKIE = 'paymenter_intended';

/** Only same-site paths are accepted (open redirect protection). */
export function safeIntended(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
    const base = baseUrl();
    if (value.startsWith(base + '/')) return value.slice(base.length);
    return null;
}

export async function pullIntended(fallback: string): Promise<string> {
    const jar = await cookies();
    const raw = jar.get(INTENDED_COOKIE)?.value;
    const value = safeIntended(raw ? decodeURIComponent(raw) : null);
    if (raw) jar.set(INTENDED_COOKIE, '', { path: '/', maxAge: 0 });
    return value ?? fallback;
}
