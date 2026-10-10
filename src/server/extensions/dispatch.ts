import { ExtensionHelper } from './helper';
import type { ExtensionRoute, ExtensionRouteContext } from './types';
import { boot } from '@/server/bootstrap';
import { ensureSettings } from '@/server/settings/store';
import { getCurrentUser } from '@/server/auth/session';
import { clientIp } from '@/server/api/admin';

/** `/path/{param}` -> matcher; returns the params or null */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
    const names: string[] = [];
    const re = new RegExp('^' + pattern.replace(/\/+$/, '').replace(/\{(\w+)(?::\w+)?\}/g, (_m, n: string) => (names.push(n), '([^/]+)')) + '/?$');
    const m = re.exec(path);
    if (!m) return null;
    return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
}

export function findRoute(method: string, path: string): { route: ExtensionRoute & { extension: string }; params: Record<string, string> } | null {
    for (const route of ExtensionHelper.routes) {
        if (route.method !== method.toUpperCase()) continue;
        const params = matchPath(route.path, path);
        if (params) return { route, params };
    }
    return null;
}

/** Routes registered by extensions (webhooks, callbacks, API endpoints). */
export async function dispatchExtensionRoute(request: Request): Promise<Response | null> {
    await boot();
    await ensureSettings();
    const url = new URL(request.url);
    const found = findRoute(request.method, url.pathname);
    if (!found) return null;

    const user = await getCurrentUser();
    if (found.route.auth && !user) return Response.redirect(new URL(`/auth/guest?to=${encodeURIComponent(url.pathname + url.search)}`, url.origin), 302);

    const ctx: ExtensionRouteContext = {
        request,
        params: found.params,
        query: url.searchParams,
        json: () => request.clone().json(),
        form: () => request.clone().formData(),
        text: () => request.clone().text(),
        user,
        ip: clientIp(request),
        async all() {
            const out: Record<string, any> = Object.fromEntries(url.searchParams.entries());
            const type = request.headers.get('content-type') ?? '';
            try {
                if (type.includes('application/json')) Object.assign(out, await request.clone().json());
                else if (type.includes('form')) (await request.clone().formData()).forEach((v, k) => (out[k] = v));
            } catch {
                /* no body */
            }
            return out;
        },
    };
    return found.route.handler(ctx);
}
