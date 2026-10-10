import type { NextRequest } from 'next/server';
import { authorizeGet } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

/** `passport.x.authorize`: the duplicate `/oauth/oauth/authorize` route declared in routes/web.php */
export const GET = (request: NextRequest) => authorizeGet(request);
