import { NextResponse, type NextRequest } from 'next/server';
import { INTENDED_COOKIE, safeIntended } from '@/server/auth/intended';
import { url } from '@/server/routes';

/** Where `requireUser()` sends guests: remember the requested page, then show the login form. */
export function GET(request: NextRequest) {
    const to = safeIntended(request.nextUrl.searchParams.get('to'));
    const res = NextResponse.redirect(url('/login'));
    if (to) res.cookies.set(INTENDED_COOKIE, encodeURIComponent(to), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 });
    return res;
}
