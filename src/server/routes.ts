import { config } from './config';
import { Model } from './orm';

/**
 * Named routes of the web application (routes/web.php). `route('invoices.show', invoice)`
 * keeps working inside stored email templates exactly as before.
 * `{param:field}` means "use this attribute of the bound model in generated URLs".
 */
export const routeTable: Record<string, string> = {
    home: '/',
    login: '/login',
    '2fa': '/2fa',
    register: '/register',
    'password.request': '/password/request',
    'password.reset': '/password/reset/{token}',
    'oauth.redirect': '/oauth/{provider}',
    'oauth.handle': '/oauth/{provider}/callback',
    dashboard: '/dashboard',
    invoices: '/invoices',
    'invoices.show': '/invoices/{invoice}',
    tickets: '/tickets',
    'tickets.create': '/tickets/create',
    'tickets.show': '/tickets/{ticket}',
    services: '/services',
    'services.show': '/services/{service}',
    'services.upgrade': '/services/{service}/upgrade',
    account: '/account',
    'account.security': '/account/security',
    'account.credits': '/account/credits',
    'account.payment-methods': '/account/payment-methods',
    'account.notifications': '/account/notifications',
    'verification.notice': '/email/verify',
    'verification.verify': '/email/verify/{id}/{hash}',
    'tickets.attachments.show': '/tickets/attachments/{attachment:uuid}',
    cart: '/cart',
    'category.show': '/products/{category:slug}',
    'products.show': '/products/{category:slug}/{product:slug}',
    'products.checkout': '/products/{category:slug}/{product:slug}/checkout',
    'passport.x.authorize': '/oauth/oauth/authorize',
    token: '/api/oauth/token',
    logout: '/logout',
    'filament.admin.pages.dashboard': '/admin',
};

/** Extensions (and tests) register additional named routes. */
export function registerRoute(name: string, pattern: string) {
    routeTable[name] = pattern;
}

export class RouteNotFoundError extends Error {
    constructor(name: string) {
        super(`Route [${name}] not defined.`);
    }
}

function paramValue(value: unknown, field?: string): string {
    if (value instanceof Model) {
        if (field) return String((value as any)[field] ?? '');
        const withKey = value as any;
        if (typeof withKey.getRouteKey === 'function') return String(withKey.getRouteKey());
        return String(value.getKey());
    }
    return String(value ?? '');
}

export function baseUrl(): string {
    return String(config('app.url', 'http://localhost')).replace(/\/+$/, '');
}

/**
 * `route($name, $parameters, $absolute = true)`. Parameters may be an object
 * keyed by placeholder, a positional array/scalar/model, or a single model.
 * Unused parameters become the query string.
 */
export function route(name: string, parameters: unknown = {}, absolute = true): string {
    const pattern = routeTable[name];
    if (!pattern) throw new RouteNotFoundError(name);

    const placeholders = [...pattern.matchAll(/\{(\w+)(?::(\w+))?\}/g)].map((m) => ({ key: m[1], field: m[2] }));
    let params: Record<string, unknown> = {};
    const extra: string[] = [];
    if (parameters instanceof Model || typeof parameters !== 'object' || parameters === null) {
        if (parameters !== undefined && parameters !== null) {
            if (placeholders[0]) params[placeholders[0].key] = parameters;
            else extra.push(encodeURIComponent(paramValue(parameters)));
        }
    } else if (Array.isArray(parameters)) {
        parameters.forEach((value, i) => {
            if (placeholders[i]) params[placeholders[i].key] = value;
            // Laravel appends leftover positional parameters to the query string as bare values (`?5`)
            else extra.push(encodeURIComponent(paramValue(value)));
        });
    } else {
        params = { ...(parameters as Record<string, unknown>) };
    }

    const query: string[] = [...extra];
    let path = pattern.replace(/\{(\w+)(?::(\w+))?\}/g, (_m, key: string, field?: string) => {
        const v = params[key];
        delete params[key];
        return encodeURIComponent(paramValue(v, field));
    });
    for (const [k, v] of Object.entries(params)) query.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    if (query.length) path += `?${query.join('&')}`;
    return absolute ? baseUrl() + path : path;
}

/** `url('/path')`: like Laravel, `url('/')` has no trailing slash */
export function url(path = '/'): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${baseUrl()}/${path.replace(/^\/+|\/+$/g, '')}`.replace(/\/+$/, '');
}

/** `Storage::url($path)` for the public disk */
export function storageUrl(file: string | null | undefined): string {
    if (!file) return '';
    if (/^https?:\/\//i.test(file)) return file;
    return `${baseUrl()}/storage/${file.replace(/^\/+/, '')}`;
}

/** Same-origin absolute URLs become root-relative paths (for client-side navigation); anything else is unchanged. */
export function relativeUrl(u: string): string {
    const base = baseUrl();
    if (u === base) return '/';
    if (u.startsWith(base + '/')) return u.slice(base.length);
    return u;
}
