import { NextResponse, type NextRequest } from 'next/server';
import { FLASH_COOKIE } from '@/server/action';
import { safeIntended } from '@/server/auth/intended';

/**
 * `$this->notify($message, $type, redirect: true)` from a page: pages cannot set cookies, so they redirect
 * here with the key of a known message. The toast is left in a cookie and the visitor continues to `to`.
 * (Only known messages are accepted so the route cannot be used to show arbitrary text.)
 */
const MESSAGES: Record<string, [string, 'success' | 'error']> = {
    'service-not-upgradable': ['This service is not upgradable.', 'error'],
};

export function GET(request: NextRequest) {
    const p = request.nextUrl.searchParams;
    const to = safeIntended(p.get('to')) ?? '/';
    const res = NextResponse.redirect(new URL(to, request.nextUrl.origin));
    const known = MESSAGES[p.get('m') ?? ''];
    if (known) res.cookies.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ id: Date.now(), message: known[0], type: known[1] })), { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 });
    return res;
}
