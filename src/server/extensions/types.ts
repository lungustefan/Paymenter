import type { SettingDefinition } from '@/server/settings/types';

export interface ExtensionMeta {
    name: string;
    description: string;
    version: string;
    author: string;
    url?: string;
    icon?: string;
}

/**
 * What `pay()` / `getView()` may return: a React node (rendered in the payment modal / service page),
 * `{ html }` for pre-rendered markup, or a redirect (a plain string is a redirect URL for gateways).
 */
export type ExtensionView = import('react').ReactNode | { redirect: string } | { html: string };

/** A route contributed by an extension (webhooks, callbacks, extra pages). */
export interface ExtensionRoute {
    /** Laravel route name, e.g. `extensions.gateways.stripe.webhook` */
    name?: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** path like `/extensions/stripe/webhook` (supports `{param}`) */
    path: string;
    /** require an authenticated user ('auth') - the `web` + `auth` middleware pair */
    auth?: boolean;
    /** `->where('param', 'regex')` constraints of the route */
    where?: Record<string, string>;
    handler: (ctx: ExtensionRouteContext) => Promise<Response | void> | Response | void;
}

export interface ExtensionRouteContext {
    request: Request;
    params: Record<string, string>;
    query: URLSearchParams;
    /** parsed body helpers */
    json: () => Promise<any>;
    form: () => Promise<FormData>;
    text: () => Promise<string>;
    user: import('@/server/models/User').User | null;
    /** `$request->all()`: query string merged with the JSON / form body */
    all: () => Promise<Record<string, any>>;
    ip: string | null;
    /** a fresh instance of the extension that registered this route, with its current saved settings (like the container-resolved controller) */
    instance: <T = any>() => Promise<T>;
}

/** A page contributed by an extension (rendered inside the theme's layout). */
export interface ExtensionPage {
    /** Laravel route name, e.g. `announcements.index` */
    name?: string;
    /** path like `/announcements/{slug}` */
    path: string;
    /** require an authenticated user */
    auth?: boolean;
    /** `->where('param', 'regex')` constraints of the route */
    where?: Record<string, string>;
    title?: string;
    sidebar?: boolean;
    render: (ctx: { params: Record<string, string>; searchParams: Record<string, string | string[] | undefined>; user: import('@/server/models/User').User | null }) => Promise<import('react').ReactNode> | import('react').ReactNode;
}

export type ConfigDefinition = SettingDefinition;
