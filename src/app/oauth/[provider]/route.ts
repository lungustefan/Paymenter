import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { getAuthUser } from '@/server/auth/session';
import { sessionPut } from '@/server/session';
import { authorizeUrl, isEnabled, isProvider, newState } from '@/server/auth/social';
import { url } from '@/server/routes';

/** `SocialLoginController::redirect` (guest only) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
    await initRequest();
    const { provider } = await params;
    if (await getAuthUser()) return NextResponse.redirect(url('/dashboard'));
    if (!isProvider(provider) || !isEnabled(provider)) return new NextResponse('Not Found', { status: 404 });

    const state = newState();
    await sessionPut('oauth_state', state);
    return NextResponse.redirect(authorizeUrl(provider, state));
}
