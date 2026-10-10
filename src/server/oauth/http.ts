import type { NextRequest } from 'next/server';
import { boot } from '@/server/bootstrap';
import { ensureSettings } from '@/server/settings/store';
import { RateLimiter } from '@/server/cache';
import { Carbon } from '@/server/lib/carbon';
import { randomString } from '@/server/lib/ids';
import { getRequestInfo } from '@/server/request';
import { route } from '@/server/routes';
import { initRequest } from '@/server/page';
import { getCurrentUser, logout } from '@/server/auth/session';
import { sessionForget, sessionGet, sessionPut } from '@/server/session';
import { OauthAccessToken, decodeScopes } from '@/server/models/OauthAccessToken';
import { OauthClient } from '@/server/models/OauthClient';
import type { User } from '@/server/models/User';
import { findActiveClient } from './clients';
import { OAuthServerException } from './errors';
import { ScopeRegistry } from './ScopeRegistry';
import {
    authenticateBearer,
    completeAuthorizationRequest,
    paramsFromJson,
    paramsFromPairs,
    respondToAccessTokenRequest,
    validateAuthorizationRequest,
    type AuthorizationRequest,
    type Params,
} from './server';

/** Route glue: the Passport controllers (AuthorizationController, Approve/DenyAuthorizationController, AccessTokenController) and `/api/me`. */

/** the consent screen lives here; `GET /oauth/authorize` redirects to it after storing the request in the session */
export const CONSENT_PATH = '/oauth/authorize/consent';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

/** Plain HTML error page (the themed error views only exist for 404). */
function htmlError(status: number, message: string): Response {
    const titles: Record<number, string> = { 403: 'Forbidden', 419: 'Page Expired' };
    const esc = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return new Response(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status} ${titles[status] ?? 'Error'}</title></head><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>${status}</h1><p>${esc}</p></body></html>`,
        { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
}

/** `redirect()->guest(route('login'))` as Laravel renders it for an API route (HTML body with a meta refresh). */
function loginRedirect(): Response {
    const url = route('login');
    const html = `<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
        <meta http-equiv="refresh" content="0;url='${url}'" />

        <title>Redirecting to ${url}</title>
    </head>
    <body>
        Redirecting to <a href="${url}">${url}</a>.
    </body>
</html>`;
    return new Response(html, { status: 302, headers: { Location: url, 'Content-Type': 'text/html; charset=utf-8' } });
}

/** `Authenticate` middleware / `AuthenticationException`: send the guest to the login page, then back here. */
const guestRedirect = (request: NextRequest, remember: boolean) =>
    redirect(remember ? `/auth/guest?to=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}` : '/login');

/** `HandleCors` for `api/*` (config/cors.php defaults: any origin, no credentials). */
export function withApiCors(response: Response, request?: Request): Response {
    response.headers.set('Access-Control-Allow-Origin', '*');
    if (request?.method === 'OPTIONS') {
        response.headers.set('Access-Control-Allow-Methods', request.headers.get('access-control-request-method') ?? '*');
        response.headers.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') ?? '');
        response.headers.set('Access-Control-Max-Age', '0');
    }
    return response;
}

/** CORS preflight of the `api/*` routes */
export function apiPreflight(request: Request): Response {
    return withApiCors(new Response(null, { status: 204 }), request);
}

/** `Request::expectsJson()` */
function expectsJson(request: Request): boolean {
    const accept = (request.headers.get('accept') ?? '').toLowerCase();
    const first = accept.split(',')[0].split(';')[0].trim();
    const acceptsAny = accept === '' || first === '*/*' || first === '*';
    const ajax = request.headers.get('x-requested-with') === 'XMLHttpRequest';
    return (ajax && acceptsAny) || first.includes('/json') || first.includes('+json');
}

async function bootRequest() {
    await boot();
    await ensureSettings();
}

/** Parsed body of a POST: urlencoded / multipart forms or JSON. */
async function bodyParams(request: Request): Promise<Params> {
    const type = (request.headers.get('content-type') ?? '').toLowerCase();
    try {
        if (type.includes('json')) return paramsFromJson(await request.json());
        if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
            const data = await request.formData();
            const pairs: [string, string][] = [];
            data.forEach((value, key) => {
                if (typeof value === 'string') pairs.push([key, value]);
            });
            return paramsFromPairs(pairs);
        }
    } catch {
        /* unparsable body = empty body */
    }
    return {};
}

/* ------------------------------------------------------------------ *
 * POST /api/oauth/token
 * ------------------------------------------------------------------ */

/** `AccessTokenController::issueToken()` behind the `throttle` middleware (60 requests per minute and IP). */
export async function issueToken(request: NextRequest, options: { cors?: boolean } = {}): Promise<Response> {
    const res = await issueTokenResponse(request);
    return options.cors ? withApiCors(res) : res;
}

async function issueTokenResponse(request: NextRequest): Promise<Response> {
    await bootRequest();
    const ip = (await getRequestInfo()).ip ?? 'unknown';
    const key = `oauth_token:${ip}`;
    const limit = 60;
    if (await RateLimiter.tooManyAttempts(key, limit)) {
        const retry = (await RateLimiter.availableIn(key)) || 60;
        return json({ message: 'Too Many Attempts.' }, 429, { 'Retry-After': String(retry), 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0' });
    }
    const hits = await RateLimiter.hit(key, 60);
    try {
        const response = await respondToAccessTokenRequest(await bodyParams(request), request.headers.get('authorization'));
        response.headers.set('X-RateLimit-Limit', String(limit));
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - hits)));
        return response;
    } catch (e) {
        if (e instanceof OAuthServerException) {
            const response = e.toResponse();
            response.headers.set('X-RateLimit-Limit', String(limit));
            response.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - hits)));
            return response;
        }
        throw e;
    }
}

/* ------------------------------------------------------------------ *
 * GET /api/me
 * ------------------------------------------------------------------ */

/** `Route::get('/me')->middleware(['auth:api', 'scope:profile'])` -> `response()->json($request->user())` */
export async function me(request: NextRequest): Promise<Response> {
    await bootRequest();
    const auth = await authenticateBearer(request.headers.get('authorization'));
    return withApiCors(await meResponse(request, auth));
}

async function meResponse(request: NextRequest, auth: Awaited<ReturnType<typeof authenticateBearer>>): Promise<Response> {
    if (!auth) return expectsJson(request) ? json({ message: 'Unauthenticated.' }, 401) : loginRedirect();
    if (!auth.can('profile')) {
        return expectsJson(request)
            ? json({ message: 'Invalid scope(s) provided.' }, 403)
            : htmlError(403, 'Invalid scope(s) provided.');
    }
    return json(await auth.user.toArray());
}

/* ------------------------------------------------------------------ *
 * /oauth/authorize
 * ------------------------------------------------------------------ */

function sameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null') return !origin;
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

/** `AuthorizationController::hasGrantedScopes()` */
async function hasGrantedScopes(user: User, client: OauthClient, scopes: string[]): Promise<boolean> {
    const tokens = await OauthAccessToken.query()
        .where('client_id', client.id)
        .where('user_id', user.id)
        .where('revoked', false)
        .where('expires_at', '>', Carbon.now())
        .get();
    if (scopes.length === 0) return tokens.length > 0;
    const granted = new Set(tokens.flatMap((t) => decodeScopes(t.scopes)));
    return scopes.every((s) => granted.has(s));
}

const redirectOf = (authRequest: AuthorizationRequest, client: OauthClient) => authRequest.redirectUri ?? client.redirect_uris[0];

/** `AuthorizationController::authorize()` */
export async function authorizeGet(request: NextRequest): Promise<Response> {
    await initRequest();
    const query = paramsFromPairs(request.nextUrl.searchParams.entries());

    let authRequest: AuthorizationRequest;
    try {
        authRequest = await validateAuthorizationRequest(query, request.headers.get('authorization'));
    } catch (e) {
        if (e instanceof OAuthServerException) return e.toResponse(query.response_type === 'token');
        throw e;
    }
    const client = (await findActiveClient(authRequest.clientId))!;

    let prompt = String(query.prompt ?? '').split(' ').map((p) => p.trim()).filter(Boolean);
    // If the prompt parameter includes "none", all other prompt values will be ignored
    if (prompt.includes('none')) prompt = ['none'];

    const promptForLogin = async () => {
        await sessionPut('promptedForLogin', true);
        return guestRedirect(request, true);
    };

    const user = await getCurrentUser();
    if (!user) {
        if (prompt.includes('none')) return OAuthServerException.loginRequired(redirectOf(authRequest, client), authRequest.state).toResponse();
        return promptForLogin();
    }

    if (prompt.includes('login') && !(await sessionGet<boolean>('promptedForLogin', false))) {
        await logout();
        return promptForLogin();
    }
    await sessionForget('promptedForLogin');

    authRequest.userId = String(user.id);
    const scopeIds = [...new Set(authRequest.scopes)];
    const scopes = ScopeRegistry.scopesFor(scopeIds);

    if (!prompt.includes('consent') && (client.skipsAuthorization(user, scopeIds) || (await hasGrantedScopes(user, client, scopes.map((s) => s.id))))) {
        authRequest.approved = true;
        try {
            return await completeAuthorizationRequest(authRequest);
        } catch (e) {
            if (e instanceof OAuthServerException) return e.toResponse();
            throw e;
        }
    }

    if (prompt.includes('none')) return OAuthServerException.consentRequired(redirectOf(authRequest, client), authRequest.state).toResponse();

    await sessionPut('authToken', randomString(16));
    await sessionPut('authRequest', JSON.stringify(authRequest));
    return redirect(CONSENT_PATH);
}

/** Data of the consent view (`authorize.blade.php`), read by the consent page. */
export async function consentViewData() {
    const user = await getCurrentUser();
    const raw = await sessionGet<string | null>('authRequest', null);
    const authToken = await sessionGet<string | null>('authToken', null);
    if (!user || !raw || !authToken) return null;
    const authRequest = JSON.parse(raw) as AuthorizationRequest;
    const client = await findActiveClient(authRequest.clientId);
    if (!client) return null;
    return {
        client: { id: String(client.id), name: client.name },
        scopes: ScopeRegistry.scopesFor([...new Set(authRequest.scopes)]),
        state: authRequest.state ?? '',
        authToken,
    };
}

/** `RetrievesAuthRequestFromSession` + Approve / Deny controllers (the `auth:web` middleware guards both). */
async function answerAuthorization(request: NextRequest, approve: boolean, body: Params): Promise<Response> {
    await initRequest();
    if (!sameOrigin(request)) return htmlError(419, 'Page Expired');
    if (!(await getCurrentUser())) return guestRedirect(request, false);

    const given = typeof body.auth_token === 'string' ? body.auth_token : '';
    const stored = await sessionGet<string | null>('authToken', null);
    const raw = await sessionGet<string | null>('authRequest', null);
    await sessionForget('authToken', 'authRequest');

    if (!given || stored !== given) {
        return htmlError(403, 'The provided auth token for the request is different from the session auth token.');
    }
    if (!raw) throw new Error('Authorization request was not present in the session.');

    const authRequest = JSON.parse(raw) as AuthorizationRequest;
    authRequest.approved = approve;
    try {
        return await completeAuthorizationRequest(authRequest);
    } catch (e) {
        if (e instanceof OAuthServerException) return e.toResponse();
        throw e;
    }
}

/** `POST /oauth/authorize`; HTML forms spoof `DELETE` with `_method=DELETE` (Laravel's `@method('DELETE')`). */
export async function authorizePost(request: NextRequest): Promise<Response> {
    const body = await bodyParams(request);
    const method = typeof body._method === 'string' ? body._method.toUpperCase() : 'POST';
    return answerAuthorization(request, method !== 'DELETE', body);
}

/** `DELETE /oauth/authorize` */
export async function authorizeDelete(request: NextRequest): Promise<Response> {
    return answerAuthorization(request, false, await bodyParams(request));
}
