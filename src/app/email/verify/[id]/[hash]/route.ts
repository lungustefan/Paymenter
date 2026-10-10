import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { getAuthUser } from '@/server/auth/session';
import { hasValidSignature, sha1 } from '@/server/lib/crypto';
import { baseUrl } from '@/server/routes';
import { dispatch } from '@/server/events';

/** `Route::get('/email/verify/{id}/{hash}')->middleware(['auth', 'signed'])` + EmailVerificationRequest::fulfill() */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; hash: string }> }) {
    await initRequest();
    const user = await getAuthUser();
    const { id, hash } = await params;
    if (!user) return NextResponse.redirect(new URL(`/auth/guest?to=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, request.nextUrl.origin));

    const url = baseUrl() + request.nextUrl.pathname;
    if (!hasValidSignature(url, request.nextUrl.searchParams)) return new NextResponse('Invalid signature.', { status: 403 });
    if (String(user.id) !== id || sha1(user.email as string) !== hash) return new NextResponse('This action is unauthorized.', { status: 403 });

    if (!user.hasVerifiedEmail()) {
        await user.markEmailAsVerified();
        await dispatch('Illuminate\\Auth\\Events\\Verified', { user });
    }
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl.origin));
}
