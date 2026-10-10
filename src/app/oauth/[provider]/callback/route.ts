import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { getAuthUser, login } from '@/server/auth/session';
import { sessionGet, sessionForget, sessionPut } from '@/server/session';
import { fetchUser, isEnabled, isProvider } from '@/server/auth/social';
import { User } from '@/server/models/User';
import { Carbon } from '@/server/lib/carbon';
import { FLASH_COOKIE } from '@/server/action';

/** `SocialLoginController::handle` */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    const { tr } = await initRequest();
    const { provider } = await params;
    const origin = request.nextUrl.origin;
    if (await getAuthUser()) return NextResponse.redirect(new URL('/dashboard', origin));
    if (!isProvider(provider) || !isEnabled(provider)) return new NextResponse('Not Found', { status: 404 });

    const fail = (to: string, message: string) => {
        const res = NextResponse.redirect(new URL(to, origin));
        res.cookies.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ id: Date.now(), message, type: 'error' })), { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 });
        return res;
    };

    const state = await sessionGet<string | null>('oauth_state', null);
    await sessionForget('oauth_state');
    const code = request.nextUrl.searchParams.get('code');
    if (!code || !state || state !== request.nextUrl.searchParams.get('state')) return NextResponse.redirect(new URL('/login', origin));

    let social;
    try {
        social = await fetchUser(provider, code);
    } catch {
        return NextResponse.redirect(new URL('/login', origin));
    }
    if (!social.verified) return fail('/login', tr.t(`auth.oauth.unverified_${provider}_account`));

    const user = social.email ? await User.query().where('email', social.email).first() : null;
    if (!user) return fail('/register', tr.t('auth.oauth.account_not_registered'));

    if (user.tfa_secret) {
        await sessionPut('2fa', { user_id: user.id, remember: true, expires: Carbon.now().addMinutes(5).toDateTimeString() });
        return NextResponse.redirect(new URL('/2fa', origin));
    }
    await login(user, true);
    return NextResponse.redirect(new URL('/', origin));
}
