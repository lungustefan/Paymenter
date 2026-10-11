import { vi } from 'vitest';

/**
 * A tiny browser: keeps cookies between "requests" and gives every request the
 * `next/headers` context (headers + cookie jar) the server code expects. It is
 * what Laravel's `$this->get()`/`withSession()` test helpers provide.
 */

interface CurrentRequest {
    headers: Headers;
    jar: Map<string, string>;
    setCookies: { name: string; value: string; maxAge?: number }[];
}

const g = globalThis as unknown as { __testRequest?: CurrentRequest | null };

export function currentTestRequest() {
    return g.__testRequest ?? null;
}

/** Installed by tests/helpers/setup.ts as the implementation of `next/headers`. */
export function nextHeadersMock() {
    const req = () => {
        const r = currentTestRequest();
        if (!r) throw new Error('`headers` was called outside a request scope.');
        return r;
    };
    return {
        headers: async () => req().headers,
        cookies: async () => {
            const r = req();
            return {
                get: (name: string) => (r.jar.has(name) ? { name, value: r.jar.get(name)! } : undefined),
                has: (name: string) => r.jar.has(name),
                getAll: () => [...r.jar.entries()].map(([name, value]) => ({ name, value })),
                set: (name: string, value: string, options?: { maxAge?: number }) => {
                    r.setCookies.push({ name, value, maxAge: options?.maxAge });
                    // visible to the rest of the same request, like Next's cookies().set
                    if (options?.maxAge === 0 || value === '') r.jar.delete(name);
                    else r.jar.set(name, value);
                },
                delete: (name: string) => {
                    r.setCookies.push({ name, value: '', maxAge: 0 });
                    r.jar.delete(name);
                },
            };
        },
    };
}

export interface RequestOptions {
    ip?: string;
    userAgent?: string;
    path?: string;
}

export interface RequestResult<T> {
    value?: T;
    /** set when the code called `redirect()` */
    redirect?: string;
    /** set when the code called `notFound()` */
    notFound?: boolean;
    /** other errors are re-thrown */
}

export class Browser {
    cookies = new Map<string, string>();
    ip = '127.0.0.1';
    userAgent = 'Vitest';

    constructor(options: RequestOptions = {}) {
        if (options.ip) this.ip = options.ip;
        if (options.userAgent) this.userAgent = options.userAgent;
    }

    cookie(name: string): string | undefined {
        return this.cookies.get(name);
    }

    /** Runs `fn` as one request of this browser. `redirect()` / `notFound()` are caught and returned. */
    async request<T>(fn: () => Promise<T>, options: RequestOptions = {}): Promise<RequestResult<T>> {
        const headers = new Headers({
            'user-agent': options.userAgent ?? this.userAgent,
            'x-forwarded-for': options.ip ?? this.ip,
            host: 'localhost',
            'x-paymenter-path': options.path ?? '/',
        });
        const req: CurrentRequest = { headers, jar: new Map(this.cookies), setCookies: [] };
        const previous = g.__testRequest;
        g.__testRequest = req;
        try {
            return { value: await fn() };
        } catch (e: any) {
            const digest = String(e?.digest ?? '');
            if (digest.startsWith('NEXT_REDIRECT')) return { redirect: digest.split(';')[2] };
            if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') || digest === 'NEXT_NOT_FOUND') return { notFound: true };
            throw e;
        } finally {
            for (const c of req.setCookies) {
                if (c.maxAge === 0 || c.value === '') this.cookies.delete(c.name);
                else this.cookies.set(c.name, c.value);
            }
            g.__testRequest = previous ?? null;
        }
    }
}

export { vi };
