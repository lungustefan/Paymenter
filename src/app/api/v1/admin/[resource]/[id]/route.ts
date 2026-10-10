import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handleAdminApi, withCors } from '@/server/api/admin';

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest, { params }: Ctx) {
    const { resource, id } = await params;
    return withCors(await handleAdminApi(request, resource, id));
}

export const GET = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export function OPTIONS(request: NextRequest) {
    return withCors(new NextResponse(null, { status: 204 }), request);
}
