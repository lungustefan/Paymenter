import type { NextRequest, NextResponse } from 'next/server';
import { boot } from '@/server/bootstrap';
import { ensureSettings } from '@/server/settings/store';
import { config } from '@/server/config';
import { decryptCookie, encryptCookie } from '@/server/lib/crypto';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Extension } from '@/server/models/Extension';
import { UserSession } from '@/server/models/UserSession';
import { SESSION_COOKIE } from '@/server/session';
import { Affiliate } from './Affiliate';

const REMEMBER_COOKIE = 'paymenter_remember';
import { REFERRED_BY } from './constants';

const readCookie = (request: NextRequest, name: string): string | null => {
    const raw = request.cookies.get(name)?.value;
    if (!raw) return null;
    try {
        return decryptCookie(name, decodeURIComponent(raw));
    } catch {
        return null;
    }
};

/** `auth()->id()` from the request's cookies */
async function authenticatedUserId(request: NextRequest): Promise<number | null> {
    let ulid: string | null = null;
    const session = readCookie(request, SESSION_COOKIE);
    if (session) {
        try {
            ulid = JSON.parse(session).user_session ?? null;
        } catch {
            /* invalid session */
        }
    }
    let token = ulid ? await UserSession.findValid(ulid) : null;
    if (!token) {
        const remember = readCookie(request, REMEMBER_COOKIE);
        if (remember) token = await UserSession.findValid(remember);
    }
    return token ? (token.user_id as number) : null;
}

export async function handleReferral(request: NextRequest, response: NextResponse): Promise<void> {
    await boot();
    await ensureSettings();
    // routes and middleware of an extension only exist while it is enabled
    if (!(await Extension.query().where('extension', 'Affiliates').where('enabled', true).first())) return;

    const ref = request.nextUrl.searchParams.get('ref') ?? '';
    const affiliate = await Affiliate.query().where('code', ref).first();

    if (!affiliate || affiliate.user_id === (await authenticatedUserId(request))) {
        return;
    }

    // Increase the visitor count if a cookie is not present already, or is not the same one
    const current = readCookie(request, REFERRED_BY);
    if (current === null || current !== affiliate.code) {
        await affiliate.incrementColumn('visitors');
    }

    const extension = await ExtensionHelper.getExtension('other', 'Affiliates');
    const cookieMaxAge = Number.parseInt(String(extension.config('cookie_max_age') ?? ''), 10) || 0;

    // Never expire = `Cookie::forever()` (5 years)
    const minutes = cookieMaxAge > 0 ? 60 * 24 * cookieMaxAge : 2628000;
    response.cookies.set(REFERRED_BY, encodeURIComponent(encryptCookie(REFERRED_BY, affiliate.code as string)), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: String(config('app.url', '')).startsWith('https://'),
        maxAge: minutes * 60,
    });
}
