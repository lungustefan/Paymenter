import { NextResponse, type NextRequest } from 'next/server';
import { INTENDED_COOKIE, safeIntended } from '@/server/auth/intended';

/** Where `requireUser()` sends guests: remember the requested page, then show the login form. */
export function GET(request: NextRequest) {
    const to = safeIntended(request.nextUrl.searchParams.get('to'));
    const res = NextResponse.redirect(new URL('/login', request.nextUrl.origin));
    if (to) res.cookies.set(INTENDED_COOKIE, encodeURIComponent(to), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 });
    return res;
}
