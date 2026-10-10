import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs before every request. Equivalent of the global parts of the Laravel HTTP
 * kernel: it only forwards the request path to server components (they cannot see
 * the URL on their own), the heavy lifting lives in the page helpers.
 */
export function proxy(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.set('x-paymenter-path', request.nextUrl.pathname);
    headers.set('x-paymenter-search', request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|build/|fonts/|css/|js/|assets/|service-worker.js).*)'],
};
