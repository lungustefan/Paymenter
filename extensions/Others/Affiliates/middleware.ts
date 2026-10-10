import type { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware/AffiliatesMiddleware.php - runs in the proxy for every client area request.
 * Kept free of heavy imports: the work is only loaded when the request has a `ref` parameter.
 */
export function matches(request: NextRequest): boolean {
    return request.nextUrl.searchParams.has('ref');
}

export async function handle(request: NextRequest, response: NextResponse): Promise<void> {
    const { handleReferral } = await import('./referral');
    await handleReferral(request, response);
}
