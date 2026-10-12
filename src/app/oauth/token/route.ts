import type { NextRequest } from 'next/server';
import { issueToken } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

/** `passport.token`: Passport's own `/oauth/token` route (same controller as `/api/oauth/token`) */
export const POST = (request: NextRequest) => issueToken(request);
