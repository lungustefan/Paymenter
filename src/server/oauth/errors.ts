/**
 * Port of League\OAuth2\Server\Exception\OAuthServerException.
 * `toResponse()` mirrors `generateHttpResponse()`: errors with a redirect URI become a 302,
 * everything else a JSON body with the same `error` / `error_description` / `hint` payload.
 */

/** PHP's `http_build_query()` (RFC 1738: spaces as `+`, null values skipped). */
export function httpBuildQuery(params: Record<string, string | null | undefined>): string {
    return Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${phpUrlencode(k)}=${phpUrlencode(String(v))}`)
        .join('&');
}

export function phpUrlencode(value: string): string {
    return encodeURIComponent(value)
        .replace(/%20/g, '+')
        .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** `makeRedirectUri()` of AbstractAuthorizeGrant */
export function makeRedirectUri(uri: string, params: Record<string, string | null | undefined> = {}, delimiter = '?'): string {
    uri += uri.includes(delimiter) ? '&' : delimiter;
    return uri + httpBuildQuery(params);
}

export class OAuthServerException extends Error {
    payload: Record<string, string>;
    /** the request that caused an `invalid_client`, used for the `WWW-Authenticate` header */
    authorizationHeader: string | null = null;

    constructor(
        message: string,
        public readonly errorCode: number,
        public readonly errorType: string,
        public readonly httpStatusCode = 400,
        public readonly hint: string | null = null,
        public redirectUri: string | null = null,
        public readonly previous?: unknown,
    ) {
        super(message);
        this.payload = { error: errorType, error_description: message };
        if (hint !== null) this.payload.hint = hint;
    }

    static unsupportedGrantType() {
        return new OAuthServerException(
            'The authorization grant type is not supported by the authorization server.',
            2,
            'unsupported_grant_type',
            400,
            'Check that all required parameters have been provided',
        );
    }

    static invalidRequest(parameter: string, hint: string | null = null, previous?: unknown) {
        return new OAuthServerException(
            'The request is missing a required parameter, includes an invalid parameter value, includes a parameter more than once, or is otherwise malformed.',
            3,
            'invalid_request',
            400,
            hint ?? `Check the \`${parameter}\` parameter`,
            null,
            previous,
        );
    }

    static invalidClient(authorizationHeader: string | null = null) {
        const e = new OAuthServerException('Client authentication failed', 4, 'invalid_client', 401);
        e.authorizationHeader = authorizationHeader;
        return e;
    }

    static invalidScope(scope: string, redirectUri: string | null = null) {
        const hint = scope === '' ? 'Specify a scope in the request or set a default scope' : `Check the \`${htmlspecialchars(scope)}\` scope`;
        return new OAuthServerException('The requested scope is invalid, unknown, or malformed', 5, 'invalid_scope', 400, hint, redirectUri);
    }

    static serverError(hint: string, previous?: unknown) {
        return new OAuthServerException(
            'The authorization server encountered an unexpected condition which prevented it from fulfilling the request: ' + hint,
            7,
            'server_error',
            500,
            null,
            null,
            previous,
        );
    }

    static invalidRefreshToken(hint: string | null = null, previous?: unknown) {
        return new OAuthServerException('The refresh token is invalid.', 8, 'invalid_grant', 400, hint, null, previous);
    }

    static accessDenied(hint: string | null = null, redirectUri: string | null = null, previous?: unknown) {
        return new OAuthServerException(
            'The resource owner or authorization server denied the request.',
            9,
            'access_denied',
            401,
            hint,
            redirectUri,
            previous,
        );
    }

    static invalidGrant(hint = '') {
        return new OAuthServerException(
            'The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.',
            10,
            'invalid_grant',
            400,
            hint,
        );
    }

    static unauthorizedClient(hint: string | null = null) {
        return new OAuthServerException(
            'The authenticated client is not authorized to use this authorization grant type.',
            14,
            'unauthorized_client',
            400,
            hint,
        );
    }

    /** Passport's `OAuthServerException::loginRequired()` */
    static loginRequired(redirectUri: string, state: string | null) {
        const e = new OAuthServerException('The authorization server requires end-user authentication.', 9, 'login_required', 401, 'The user is not authenticated', redirectUri);
        e.payload = { ...(state !== null ? { state } : {}), ...e.payload };
        return e;
    }

    /** Passport's `OAuthServerException::consentRequired()` */
    static consentRequired(redirectUri: string, state: string | null) {
        const e = new OAuthServerException('The authorization server requires end-user consent.', 9, 'consent_required', 401, null, redirectUri);
        e.payload = { ...(state !== null ? { state } : {}), ...e.payload };
        return e;
    }

    get hasRedirect() {
        return this.redirectUri !== null;
    }

    headers(): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.errorType === 'invalid_client' && this.authorizationHeader) {
            headers['WWW-Authenticate'] = (this.authorizationHeader.startsWith('Bearer') ? 'Bearer' : 'Basic') + ' realm="OAuth"';
        }
        return headers;
    }

    toResponse(useFragment = false): Response {
        if (this.redirectUri !== null) {
            let uri = this.redirectUri;
            if (useFragment) uri += !uri.includes('#') ? '#' : '&';
            else uri += !uri.includes('?') ? '?' : '&';
            return new Response(null, { status: 302, headers: { Location: uri + httpBuildQuery(this.payload) } });
        }
        return new Response(JSON.stringify(this.payload).replace(/\//g, '\\/'), { status: this.httpStatusCode, headers: this.headers() });
    }
}

/** `htmlspecialchars($s, ENT_QUOTES, 'UTF-8', false)` (no double encoding) */
function htmlspecialchars(s: string): string {
    return s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
