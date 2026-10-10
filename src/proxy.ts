import { NextResponse, type NextRequest } from 'next/server';
import { middlewareRegistry } from '@/generated/registry';

/**
 * Runs before every request. Equivalent of the global parts of the Laravel HTTP
 * kernel: it forwards the request path to server components (they cannot see
 * the URL on their own) and runs the middleware of extensions (the `web` middleware
 * stack: e.g. the referral cookie of the Affiliates extension).
 */
export async function proxy(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.set('x-paymenter-path', request.nextUrl.pathname);
    headers.set('x-paymenter-search', request.nextUrl.search);
    const response = NextResponse.next({ request: { headers } });

    // Extensions only get the client area (`web`), not API requests
    if (!request.nextUrl.pathname.startsWith('/api/')) {
        for (const entry of middlewareRegistry) {
            try {
                const mod = await entry.load();
                if (mod.matches(request)) await mod.handle(request, response);
            } catch (e) {
                console.error(`[extension:${entry.name}] middleware failed:`, e);
            }
        }
    }

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|build/|fonts/|css/|js/|assets/|service-worker.js).*)'],
};
