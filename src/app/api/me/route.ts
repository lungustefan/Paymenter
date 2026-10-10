import type { NextRequest } from 'next/server';
import { apiPreflight, me } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

/** `Route::get('/me')->middleware(['auth:api', 'scope:profile'])` */
export const GET = (request: NextRequest) => me(request);
export const OPTIONS = (request: NextRequest) => apiPreflight(request);
