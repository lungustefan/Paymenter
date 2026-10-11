/**
 * Per-request memo store.
 *
 * Next.js gives every request its own `headers()` object; using it as a
 * WeakMap key gives us request-scoped state that works in pages, server
 * actions and route handlers alike (React's `cache()` only works while
 * rendering). Outside of a request (CLI, queue worker) a process-wide store
 * is used.
 */
const stores = new WeakMap<object, Map<string, unknown>>();
const processStore = new Map<string, unknown>();

export async function requestScope(): Promise<Map<string, unknown>> {
    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        let m = stores.get(h);
        if (!m) stores.set(h, (m = new Map()));
        return m;
    } catch {
        return processStore;
    }
}

/** Compute `fn` once per request and memoise the (promise of the) result. */
export async function once<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const scope = await requestScope();
    if (!scope.has(key)) scope.set(key, Promise.resolve(fn()));
    return scope.get(key) as Promise<T>;
}

export async function forgetOnce(key: string) {
    (await requestScope()).delete(key);
}
