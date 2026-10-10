import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handleAdminApi, withCors } from '@/server/api/admin';

type Ctx = { params: Promise<{ resource: string }> };

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: Ctx) {
    return withCors(await handleAdminApi(request, (await params).resource, null));
}
export async function POST(request: NextRequest, { params }: Ctx) {
    return withCors(await handleAdminApi(request, (await params).resource, null));
}
export function OPTIONS(request: NextRequest) {
    return withCors(new NextResponse(null, { status: 204 }), request);
}
