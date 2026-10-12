import type { NextRequest } from 'next/server';
import { apiPreflight, issueToken } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

/** `token`: `AccessTokenController@issueToken` */
export const POST = (request: NextRequest) => issueToken(request, { cors: true });
export const OPTIONS = (request: NextRequest) => apiPreflight(request);
