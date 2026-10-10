import { dispatchExtensionRoute } from '@/server/extensions/dispatch';

export const dynamic = 'force-dynamic';

async function handle(request: Request) {
    return (await dispatchExtensionRoute(request)) ?? new Response('Not Found', { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
