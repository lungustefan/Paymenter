import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Carbon } from '@/server/lib/carbon';
import { checkPassword } from '@/server/lib/crypto';
import { OauthAccessToken, decodeScopes } from '@/server/models/OauthAccessToken';
import { OauthAuthCode } from '@/server/models/OauthAuthCode';
import { OauthClient } from '@/server/models/OauthClient';
import { OauthRefreshToken } from '@/server/models/OauthRefreshToken';
import { User } from '@/server/models/User';
import { decryptWithPassword, encryptWithPassword } from './defuse';
import { OAuthServerException, makeRedirectUri } from './errors';
import { signJwt, verifyJwt } from './jwt';
import { privateKey, publicKey } from './keys';
import { ScopeRegistry } from './ScopeRegistry';
import { findActiveClient } from './clients';

/**
 * Port of league/oauth2-server (authorization code, refresh token and client credentials grants, bearer token
 * validation) together with the Laravel\Passport bridge repositories, configured like Paymenter configures Passport 13.7.5:
 * access tokens and refresh tokens live one year (`P1Y`), authorization codes ten minutes (`PT10M`), refresh tokens are
 * revoked after use, there is no default scope, the implicit / password / device grants are not enabled.
 */

const AUTH_CODE_TTL_SECONDS = 10 * 60;
const SCOPE_DELIMITER = ' ';
const CODE_CHALLENGE_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

/* ------------------------------------------------------------------ *
 * Request parameters
 * ------------------------------------------------------------------ */

/** A parameter is a string; PHP array syntax (`scope[]=x`) is kept as an array and rejected like a non-scalar value. */
export type Params = Record<string, string | string[]>;

/** Builds the parameter bag the way PHP parses a query string / urlencoded body (last value wins, `a[]` is an array). */
export function paramsFromPairs(pairs: Iterable<[string, string]>): Params {
    const out: Params = {};
    for (const [rawKey, value] of pairs) {
        const bracket = rawKey.indexOf('[');
        if (bracket > 0) {
            const base = rawKey.slice(0, bracket);
            const current = out[base];
            out[base] = Array.isArray(current) ? [...current, value] : [value];
        } else if (rawKey !== '') {
            out[rawKey] = value;
        }
    }
    return out;
}

/** JSON request bodies: scalars become strings, anything else is a non-scalar value. */
export function paramsFromJson(body: unknown): Params {
    const out: Params = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;
        if (typeof v === 'string') out[k] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = typeof v === 'boolean' ? (v ? '1' : '') : String(v);
        else out[k] = [];
    }
    return out;
}

/** `AbstractGrant::parseParam()` */
function param(params: Params, name: string, fallback: string | null = null): string | null {
    const raw = params[name];
    if (Array.isArray(raw)) throw OAuthServerException.invalidRequest(name);
    let value = (raw ?? '').trim();
    if (value === '') {
        value = fallback === null ? '' : fallback.trim();
        if (value === '') return null;
    }
    return value;
}

/** HTTP Basic credentials of an `Authorization` header: [user, password] or [null, null]. */
export function basicCredentials(authorization: string | null): [string | null, string | null] {
    if (!authorization || authorization.toLowerCase().indexOf('basic ') !== 0) return [null, null];
    const encoded = authorization.slice(6);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return [null, null];
    const decoded = Buffer.from(encoded, 'base64');
    const text = decoded.toString('utf8');
    const idx = text.indexOf(':');
    if (idx === -1) return [null, null];
    const user = text.slice(0, idx);
    if (user === '') return [null, null];
    return [user, text.slice(idx + 1)];
}

/* ------------------------------------------------------------------ *
 * Entities
 * ------------------------------------------------------------------ */

export interface ClientEntity {
    id: string;
    name: string;
    redirectUris: string[];
    confidential: boolean;
    provider: string | null;
    grantTypes: string[];
}

function toEntity(client: OauthClient): ClientEntity {
    return {
        id: String(client.id),
        name: client.name,
        redirectUris: client.redirect_uris,
        confidential: client.confidential(),
        provider: client.provider ?? null,
        grantTypes: client.grant_types,
    };
}

async function getClientEntityOrFail(clientId: string, grant: string, authorization: string | null): Promise<ClientEntity> {
    const client = await findActiveClient(clientId);
    if (!client) throw OAuthServerException.invalidClient(authorization);
    const entity = toEntity(client);
    if (!entity.grantTypes.includes(grant)) throw OAuthServerException.unauthorizedClient();
    return entity;
}

/** The pending authorization request, serialisable into the session between the consent screen and the approval. */
export interface AuthorizationRequest {
    grantTypeId: 'authorization_code';
    clientId: string;
    redirectUri: string | null;
    scopes: string[];
    state: string | null;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
    userId: string | null;
    approved: boolean;
}

/* ------------------------------------------------------------------ *
 * Scopes
 * ------------------------------------------------------------------ */

/** `AbstractGrant::validateScopes()` + `ScopeRepository::getScopeEntityByIdentifier()` */
export function validateScopes(scopes: string | string[] | null, redirectUri: string | null = null): string[] {
    let list: string[];
    if (scopes === null) list = [];
    else if (typeof scopes === 'string') list = scopes.trim().split(SCOPE_DELIMITER).filter((s) => s !== '');
    else list = scopes;
    for (const scope of list) {
        if (!ScopeRegistry.has(scope)) throw OAuthServerException.invalidScope(scope, redirectUri);
    }
    return list;
}

/** `ScopeRepository::finalizeScopes()` */
function finalizeScopes(scopes: string[], grantType: string): string[] {
    let out = scopes;
    if (!['password', 'personal_access', 'client_credentials'].includes(grantType)) out = out.filter((s) => s !== '*');
    return out.filter((s) => ScopeRegistry.has(s));
}

/* ------------------------------------------------------------------ *
 * Redirect URI validation (RedirectUriValidator)
 * ------------------------------------------------------------------ */

function withoutPort(uri: string): string {
    const u = new URL(uri);
    u.port = '';
    return u.toString();
}

function validateRedirectUri(redirectUri: string, allowed: string[]): boolean {
    let loopback = false;
    try {
        const u = new URL(redirectUri);
        loopback = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === '[::1]');
    } catch {
        loopback = false;
    }
    if (loopback) {
        const target = withoutPort(redirectUri);
        return allowed.some((a) => {
            try {
                return withoutPort(a) === target;
            } catch {
                return false;
            }
        });
    }
    return allowed.includes(redirectUri);
}

/* ------------------------------------------------------------------ *
 * Authorization endpoint
 * ------------------------------------------------------------------ */

/** `AuthorizationServer::validateAuthorizationRequest()` -> `AuthCodeGrant::validateAuthorizationRequest()` */
export async function validateAuthorizationRequest(query: Params, authorization: string | null = null): Promise<AuthorizationRequest> {
    if (query.response_type === undefined) throw OAuthServerException.invalidRequest('response_type');
    // only the authorization code grant answers authorization requests (the implicit grant is disabled)
    if (query.response_type !== 'code' || query.client_id === undefined) throw OAuthServerException.unsupportedGrantType();

    const [basicUser] = basicCredentials(authorization);
    const clientId = param(query, 'client_id', basicUser);
    if (clientId === null) throw OAuthServerException.invalidRequest('client_id');

    const client = await getClientEntityOrFail(clientId, 'authorization_code', authorization);

    const redirectUri = param(query, 'redirect_uri');
    if (redirectUri !== null) {
        if (!validateRedirectUri(redirectUri, client.redirectUris)) throw OAuthServerException.invalidClient(authorization);
    } else if (client.redirectUris.length !== 1) {
        throw OAuthServerException.invalidClient(authorization);
    }

    const state = param(query, 'state');
    const scopes = validateScopes(param(query, 'scope', ''), makeRedirectUri(redirectUri ?? client.redirectUris[0], state !== null ? { state } : {}));

    const request: AuthorizationRequest = {
        grantTypeId: 'authorization_code',
        clientId: client.id,
        redirectUri,
        scopes,
        state,
        codeChallenge: null,
        codeChallengeMethod: null,
        userId: null,
        approved: false,
    };

    const codeChallenge = param(query, 'code_challenge');
    if (codeChallenge !== null) {
        const method = param(query, 'code_challenge_method', 'plain');
        if (method === null) throw OAuthServerException.invalidRequest('code_challenge_method', 'Code challenge method must be provided when `code_challenge` is set.');
        if (!['S256', 'plain'].includes(method)) {
            throw OAuthServerException.invalidRequest('code_challenge_method', 'Code challenge method must be one of `S256`, `plain`');
        }
        if (!CODE_CHALLENGE_RE.test(codeChallenge)) {
            throw OAuthServerException.invalidRequest('code_challenge', 'Code challenge must follow the specifications of RFC-7636.');
        }
        request.codeChallenge = codeChallenge;
        request.codeChallengeMethod = method;
    } else if (!client.confidential) {
        throw OAuthServerException.invalidRequest('code_challenge', 'Code challenge must be provided for public clients');
    }

    return request;
}

const uniqueIdentifier = () => randomBytes(40).toString('hex');

/**
 * `AuthorizationServer::completeAuthorizationRequest()`: approved -> 302 to the client with `code` and `state`,
 * denied -> throws the `access_denied` exception (a redirect back to the client with the error).
 */
export async function completeAuthorizationRequest(request: AuthorizationRequest): Promise<Response> {
    if (!request.userId) throw new Error('An instance of UserEntityInterface should be set on the AuthorizationRequest');
    const client = await findActiveClient(request.clientId);
    if (!client) throw OAuthServerException.invalidClient();
    const entity = toEntity(client);
    const finalRedirectUri = request.redirectUri ?? entity.redirectUris[0];

    if (request.approved) {
        const expiresAt = Carbon.now().addSeconds(AUTH_CODE_TTL_SECONDS);
        const id = uniqueIdentifier();
        await OauthAuthCode.create({
            id,
            user_id: Number(request.userId),
            client_id: entity.id,
            scopes: JSON.stringify(request.scopes),
            revoked: false,
            expires_at: expiresAt,
        });
        const payload = {
            client_id: entity.id,
            redirect_uri: request.redirectUri,
            auth_code_id: id,
            scopes: request.scopes,
            user_id: request.userId,
            expire_time: Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SECONDS,
            code_challenge: request.codeChallenge,
            code_challenge_method: request.codeChallengeMethod,
        };
        const code = await encryptWithPassword(JSON.stringify(payload));
        return new Response(null, { status: 302, headers: { Location: makeRedirectUri(finalRedirectUri, { code, state: request.state }) } });
    }

    throw OAuthServerException.accessDenied('The user denied the request', makeRedirectUri(finalRedirectUri, { state: request.state }));
}

/* ------------------------------------------------------------------ *
 * Token endpoint
 * ------------------------------------------------------------------ */

interface IssuedAccessToken {
    id: string;
    client: ClientEntity;
    userId: string | null;
    scopes: string[];
    expiresAt: Carbon;
    jwt: string;
}

async function issueAccessToken(client: ClientEntity, userId: string | null, scopes: string[]): Promise<IssuedAccessToken> {
    const expiresAt = Carbon.now().addYears(1); // Passport::tokensExpireIn() = P1Y
    const id = uniqueIdentifier();
    await OauthAccessToken.create({
        id,
        user_id: userId === null ? null : Number(userId),
        client_id: client.id,
        scopes: JSON.stringify(scopes),
        revoked: false,
        expires_at: expiresAt,
    });
    // lcobucci/jwt writes dates as unix timestamps with microseconds and a single audience as a string
    const now = Number((Date.now() / 1000).toFixed(6));
    const claims = {
        aud: client.id,
        jti: id,
        iat: now,
        nbf: now,
        exp: Number((expiresAt.date.getTime() / 1000).toFixed(6)),
        sub: userId ?? client.id,
        scopes,
    };
    return { id, client, userId, scopes, expiresAt, jwt: signJwt(claims, privateKey()) };
}

async function issueRefreshToken(accessToken: IssuedAccessToken) {
    if (!accessToken.client.grantTypes.includes('refresh_token')) return null;
    const expiresAt = Carbon.now().addYears(1); // Passport::refreshTokensExpireIn() = P1Y
    const id = uniqueIdentifier();
    await OauthRefreshToken.create({ id, access_token_id: accessToken.id, revoked: false, expires_at: expiresAt });
    return { id, expiresAt };
}

/** `BearerTokenResponse::generateHttpResponse()` */
async function bearerResponse(accessToken: IssuedAccessToken, refreshToken: { id: string; expiresAt: Carbon } | null): Promise<Response> {
    const params: Record<string, unknown> = {
        token_type: 'Bearer',
        expires_in: accessToken.expiresAt.timestamp - Math.floor(Date.now() / 1000),
        access_token: accessToken.jwt,
    };
    if (refreshToken) {
        params.refresh_token = await encryptWithPassword(
            JSON.stringify({
                client_id: accessToken.client.id,
                refresh_token_id: refreshToken.id,
                access_token_id: accessToken.id,
                scopes: accessToken.scopes,
                user_id: accessToken.userId,
                expire_time: refreshToken.expiresAt.timestamp,
            }),
        );
    }
    return new Response(JSON.stringify(params), {
        status: 200,
        headers: { pragma: 'no-cache', 'cache-control': 'no-store', 'content-type': 'application/json; charset=UTF-8' },
    });
}

/** `AbstractGrant::validateClient()` */
async function validateClient(body: Params, authorization: string | null, grant: string): Promise<ClientEntity> {
    const [basicUser, basicPassword] = basicCredentials(authorization);
    const clientId = param(body, 'client_id', basicUser);
    if (clientId === null) throw OAuthServerException.invalidRequest('client_id');
    const clientSecret = param(body, 'client_secret', basicPassword) ?? '';

    const client = await getClientEntityOrFail(clientId, grant, authorization);
    if (client.confidential) {
        if (clientSecret === '') throw OAuthServerException.invalidRequest('client_secret');
        // Bridge\ClientRepository::validateClient(): bcrypt check against the hashed secret
        const record = await findActiveClient(clientId);
        if (!record || !record.secret || !checkPassword(clientSecret, String(record.secret))) throw OAuthServerException.invalidClient(authorization);
    }
    return client;
}

async function isAuthCodeRevoked(id: string): Promise<boolean> {
    return !(await OauthAuthCode.query().where('id', id).where('revoked', false).exists());
}

async function isRefreshTokenRevoked(id: string): Promise<boolean> {
    return !(await OauthRefreshToken.query().where('id', id).where('revoked', false).exists());
}

function verifyCodeChallenge(method: string, verifier: string, challenge: string): boolean {
    const expected = method === 'S256' ? createHash('sha256').update(verifier).digest('base64url') : verifier;
    const a = Buffer.from(expected);
    const b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function authorizationCodeGrant(body: Params, authorization: string | null): Promise<Response> {
    const client = await validateClient(body, authorization, 'authorization_code');

    const encryptedAuthCode = param(body, 'code');
    if (encryptedAuthCode === null) throw OAuthServerException.invalidRequest('code');

    let payload: any;
    let scopes: string[];
    try {
        let plain: string;
        try {
            plain = await decryptWithPassword(encryptedAuthCode);
        } catch (e) {
            throw new InvalidGrantMarker(e);
        }
        try {
            payload = JSON.parse(plain);
        } catch {
            payload = null;
        }
        if (!payload || typeof payload !== 'object' || !('auth_code_id' in payload)) {
            throw OAuthServerException.invalidRequest('code', 'Authorization code malformed');
        }
        if (Math.floor(Date.now() / 1000) > payload.expire_time) throw OAuthServerException.invalidGrant('Authorization code has expired');
        if (await isAuthCodeRevoked(payload.auth_code_id)) throw OAuthServerException.invalidGrant('Authorization code has been revoked');
        if (payload.client_id !== client.id) throw OAuthServerException.invalidRequest('code', 'Authorization code was not issued to this client');

        const redirectUri = param(body, 'redirect_uri');
        if (payload.redirect_uri !== null && payload.redirect_uri !== undefined && redirectUri === null) throw OAuthServerException.invalidRequest('redirect_uri');
        if (redirectUri !== null && payload.redirect_uri !== redirectUri) throw OAuthServerException.invalidRequest('redirect_uri', 'Invalid redirect URI');

        scopes = finalizeScopes(validateScopes(payload.scopes), 'authorization_code');
    } catch (e) {
        if (e instanceof InvalidGrantMarker) throw OAuthServerException.invalidGrant('Cannot validate the provided authorization code');
        throw e;
    }

    const codeVerifier = param(body, 'code_verifier');
    // If a code challenge isn't present but a code verifier is, reject the request to block PKCE downgrade attack
    if (!payload.code_challenge && codeVerifier !== null) {
        throw OAuthServerException.invalidRequest('code_challenge', 'code_verifier received when no code_challenge is present');
    }
    if (payload.code_challenge) {
        if (codeVerifier === null) throw OAuthServerException.invalidRequest('code_verifier');
        if (!CODE_CHALLENGE_RE.test(codeVerifier)) {
            throw OAuthServerException.invalidRequest('code_verifier', 'Code Verifier must follow the specifications of RFC-7636.');
        }
        if (payload.code_challenge_method !== undefined && payload.code_challenge_method !== null) {
            if (['S256', 'plain'].includes(payload.code_challenge_method)) {
                if (!verifyCodeChallenge(payload.code_challenge_method, codeVerifier, payload.code_challenge)) {
                    throw OAuthServerException.invalidGrant('Failed to verify `code_verifier`.');
                }
            } else {
                throw OAuthServerException.serverError(`Unsupported code challenge method \`${payload.code_challenge_method}\``);
            }
        }
    }

    const accessToken = await issueAccessToken(client, payload.user_id === null || payload.user_id === undefined ? null : String(payload.user_id), scopes);
    const refreshToken = await issueRefreshToken(accessToken);

    // Revoke used auth code
    await OauthAuthCode.query().where('id', payload.auth_code_id).update({ revoked: true });

    return bearerResponse(accessToken, refreshToken);
}

class InvalidGrantMarker extends Error {
    constructor(public cause2?: unknown) {
        super('invalid grant');
    }
}

async function refreshTokenGrant(body: Params, authorization: string | null): Promise<Response> {
    const client = await validateClient(body, authorization, 'refresh_token');

    // validateOldRefreshToken()
    const encrypted = param(body, 'refresh_token');
    if (encrypted === null) throw OAuthServerException.invalidRequest('refresh_token');
    let old: any;
    try {
        old = JSON.parse(await decryptWithPassword(encrypted));
    } catch (e) {
        throw OAuthServerException.invalidRefreshToken('Cannot decrypt the refresh token', e);
    }
    if (!old || typeof old !== 'object') throw OAuthServerException.invalidRefreshToken('Cannot decrypt the refresh token');
    if (old.client_id !== client.id) throw OAuthServerException.invalidRefreshToken('Token is not linked to client');
    if (old.expire_time < Math.floor(Date.now() / 1000)) throw OAuthServerException.invalidRefreshToken('Token has expired');
    if (await isRefreshTokenRevoked(old.refresh_token_id)) throw OAuthServerException.invalidRefreshToken('Token has been revoked');

    const oldScopes: string[] = Array.isArray(old.scopes) ? old.scopes.map(String) : [];
    let scopes = validateScopes(param(body, 'scope', oldScopes.join(SCOPE_DELIMITER)));
    // a refreshed access token can have the original scopes or fewer
    for (const scope of scopes) {
        if (!oldScopes.includes(scope)) throw OAuthServerException.invalidScope(scope);
    }
    const userId = old.user_id === null || old.user_id === undefined ? null : String(old.user_id);
    scopes = finalizeScopes(scopes, 'refresh_token');

    // Expire old tokens (Passport::$revokeRefreshTokenAfterUse = true)
    await OauthAccessToken.query().where('id', old.access_token_id).update({ revoked: true });
    await OauthRefreshToken.query().where('id', old.refresh_token_id).update({ revoked: true });

    const accessToken = await issueAccessToken(client, userId, scopes);
    const refreshToken = await issueRefreshToken(accessToken);
    return bearerResponse(accessToken, refreshToken);
}

async function clientCredentialsGrant(body: Params, authorization: string | null): Promise<Response> {
    const client = await validateClient(body, authorization, 'client_credentials');
    if (!client.confidential) throw OAuthServerException.invalidClient(authorization);
    const scopes = finalizeScopes(validateScopes(param(body, 'scope', '')), 'client_credentials');
    const accessToken = await issueAccessToken(client, null, scopes);
    return bearerResponse(accessToken, null);
}

/** `AuthorizationServer::respondToAccessTokenRequest()` */
export async function respondToAccessTokenRequest(body: Params, authorization: string | null = null): Promise<Response> {
    const grantType = body.grant_type;
    if (grantType === 'authorization_code') return authorizationCodeGrant(body, authorization);
    if (grantType === 'refresh_token') return refreshTokenGrant(body, authorization);
    if (grantType === 'client_credentials') return clientCredentialsGrant(body, authorization);
    throw OAuthServerException.unsupportedGrantType();
}

/* ------------------------------------------------------------------ *
 * Resource server (bearer tokens)
 * ------------------------------------------------------------------ */

export interface BearerToken {
    tokenId: string;
    clientId: string;
    userId: string | null;
    scopes: string[];
}

/**
 * `BearerTokenValidator::validateAuthorization()` - the JWT must be signed with the Passport key, within its
 * validity window and not revoked. Returns null for anything invalid (the guard treats all of them as "guest").
 */
export async function validateBearerToken(authorization: string | null): Promise<BearerToken | null> {
    if (!authorization) return null;
    const jwt = authorization.replace(/^\s*Bearer\s/i, '').trim();
    if (jwt === '') return null;
    let verified;
    try {
        verified = verifyJwt(jwt, publicKey());
    } catch {
        return null;
    }
    if (!verified) return null;
    const { claims } = verified;
    if (typeof claims.jti !== 'string') return null;
    // revoked tokens (and tokens unknown to the database) are rejected
    if (!(await OauthAccessToken.query().where('id', claims.jti).where('revoked', false).exists())) return null;
    const aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
    return {
        tokenId: claims.jti,
        clientId: String(aud),
        userId: claims.sub === undefined ? null : String(claims.sub),
        scopes: Array.isArray(claims.scopes) ? claims.scopes.map(String) : [],
    };
}

export interface AuthenticatedOauth {
    user: User;
    client: OauthClient;
    token: BearerToken;
    can(scope: string): boolean;
}

/** `TokenGuard::user()` for a bearer token (the `auth:api` guard of Paymenter). */
export async function authenticateBearer(authorization: string | null): Promise<AuthenticatedOauth | null> {
    const token = await validateBearerToken(authorization);
    if (!token) return null;
    const client = await findActiveClient(token.clientId);
    if (!client || (client.provider && client.provider !== 'users')) return null;
    if (!token.userId || (token.userId === token.clientId && client.hasGrantType('client_credentials'))) return null;
    const user = await User.find<User>(token.userId);
    if (!user) return null;
    return { user, client, token, can: (scope) => token.scopes.length > 0 && (token.scopes.includes('*') || token.scopes.includes(scope)) };
}

export { decodeScopes };
