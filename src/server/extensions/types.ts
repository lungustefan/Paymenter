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
    handler: (ctx: ExtensionRouteContext) => Promise<Response> | Response;
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
}

export type ConfigDefinition = SettingDefinition;
