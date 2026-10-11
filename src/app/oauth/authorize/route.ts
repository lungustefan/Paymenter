import type { NextRequest } from 'next/server';
import { authorizeDelete, authorizeGet, authorizePost } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

/** `passport.authorizations.authorize` / `.approve` / `.deny` (a static segment, so it wins over `/oauth/[provider]`) */
export const GET = (request: NextRequest) => authorizeGet(request);
export const POST = (request: NextRequest) => authorizePost(request);
export const DELETE = (request: NextRequest) => authorizeDelete(request);
