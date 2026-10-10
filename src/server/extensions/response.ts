import { NextResponse } from 'next/server';
import { FLASH_COOKIE } from '@/server/action';
import { url } from '@/server/routes';

/**
 * `redirect()->route(...)->with('notification', [...])` for extension route handlers:
 * redirect and leave the toast in the flash cookie the root layout shows.
 */
export function redirectWithNotification(to: string, notification?: { type: 'success' | 'error' | 'danger'; message: string }): Response {
    const res = NextResponse.redirect(/^https?:\/\//i.test(to) ? to : url(to), 302);
    if (notification) {
        res.cookies.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ id: Date.now() + Math.floor(Math.random() * 1000), message: notification.message, type: notification.type })), {
            path: '/',
            httpOnly: false,
            sameSite: 'lax',
            maxAge: 60,
        });
    }
    return res;
}
