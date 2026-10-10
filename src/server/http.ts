import { setting } from './config';

/**
 * Laravel-style HTTP client (`Http::withHeaders()->asForm()->post()->throw()->object()`).
 * Used by gateway / server extensions. When the "Debug Mode" setting is on, every
 * request/response is recorded in `debug_logs` like the original `RequestListener`.
 */

export class RequestException extends Error {
    constructor(public response: HttpResponse) {
        super(`HTTP request returned status code ${response.status()}:\n${response.body().slice(0, 500)}`);
        this.name = 'RequestException';
    }
}

export class ConnectionException extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConnectionException';
    }
}

export class HttpResponse {
    private cachedJson: any = undefined;
    constructor(
        private res: { status: number; headers: Headers; text: string; url: string },
        public readonly request: { method: string; url: string; headers: Record<string, string>; body?: any },
        public readonly durationMs: number,
    ) {}

    status() { return this.res.status; }
    body() { return this.res.text; }
    headers() { return this.res.headers; }
    header(name: string) { return this.res.headers.get(name) ?? ''; }
    successful() { return this.res.status >= 200 && this.res.status < 300; }
    ok() { return this.res.status === 200; }
    failed() { return this.res.status >= 400; }
    clientError() { return this.res.status >= 400 && this.res.status < 500; }
    serverError() { return this.res.status >= 500; }
    redirect() { return this.res.status >= 300 && this.res.status < 400; }

    /** decoded JSON (optionally a dot-path into it) */
    json(key?: string, fallback: any = null) {
        if (this.cachedJson === undefined) {
            try {
                this.cachedJson = JSON.parse(this.res.text);
            } catch {
                this.cachedJson = null;
            }
        }
        if (!key) return this.cachedJson;
        return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.cachedJson) ?? fallback;
    }
    /** `->object()`: JSON decoded as plain objects (property access works the same in JS) */
    object() { return this.json(); }
    collect() { return this.json() ?? []; }

    throw(callback?: (res: HttpResponse, e: RequestException) => void): this {
        if (this.failed()) {
            const e = new RequestException(this);
            if (callback) callback(this, e);
            throw e;
        }
        return this;
    }
    throwIf(cond: boolean) { return cond ? this.throw() : this; }
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';

export class PendingRequest {
    private headers: Record<string, string> = {};
    private bodyFormat: 'json' | 'form' | 'multipart' | 'raw' = 'json';
    private timeoutSec = 30;
    private baseUrlValue = '';
    private retries = 0;
    private verify = true;

    withHeaders(h: Record<string, string>) { Object.assign(this.headers, h); return this; }
    withHeader(k: string, v: string) { this.headers[k] = v; return this; }
    withToken(token: string, type = 'Bearer') { this.headers.Authorization = `${type} ${token}`; return this; }
    withBasicAuth(user: string, pass: string) { this.headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'); return this; }
    accept(type: string) { this.headers.Accept = type; return this; }
    acceptJson() { return this.accept('application/json'); }
    contentType(type: string) { this.headers['Content-Type'] = type; return this; }
    asJson() { this.bodyFormat = 'json'; return this; }
    asForm() { this.bodyFormat = 'form'; return this; }
    asMultipart() { this.bodyFormat = 'multipart'; return this; }
    withBody(body: string, contentType = 'application/json') { this.bodyFormat = 'raw'; this.headers['Content-Type'] = contentType; this.rawBody = body; return this; }
    private rawBody?: string;
    timeout(seconds: number) { this.timeoutSec = seconds; return this; }
    baseUrl(url: string) { this.baseUrlValue = url.replace(/\/+$/, ''); return this; }
    retry(times: number) { this.retries = times; return this; }
    withoutVerifying() { this.verify = false; return this; }

    get(url: string, query?: Record<string, any>) { return this.send('get', url, query); }
    head(url: string, query?: Record<string, any>) { return this.send('head', url, query); }
    post(url: string, data?: any) { return this.send('post', url, data); }
    put(url: string, data?: any) { return this.send('put', url, data); }
    patch(url: string, data?: any) { return this.send('patch', url, data); }
    delete(url: string, data?: any) { return this.send('delete', url, data); }

    private async send(method: Method, url: string, data?: any): Promise<HttpResponse> {
        const full = /^https?:\/\//i.test(url) ? url : `${this.baseUrlValue}${url.startsWith('/') ? '' : '/'}${url}`;
        let target = full;
        const headers: Record<string, string> = { ...this.headers };
        let body: any;

        if (method === 'get' || method === 'head') {
            if (data && Object.keys(data).length) {
                const qs = new URLSearchParams(flatten(data)).toString();
                target += (target.includes('?') ? '&' : '?') + qs;
            }
        } else if (this.bodyFormat === 'raw') {
            body = this.rawBody;
        } else if (this.bodyFormat === 'form') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams(flatten(data ?? {})).toString();
        } else if (this.bodyFormat === 'multipart') {
            const fd = new FormData();
            for (const [k, v] of Object.entries<any>(data ?? {})) fd.append(k, v as any);
            body = fd;
        } else {
            headers['Content-Type'] ??= 'application/json';
            body = JSON.stringify(data ?? {});
        }
        if (!headers.Accept && this.bodyFormat === 'json') headers.Accept = 'application/json';

        const attempt = async (): Promise<HttpResponse> => {
            const started = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutSec * 1000);
            try {
                const init: RequestInit & { dispatcher?: unknown } = { method: method.toUpperCase(), headers, body, signal: controller.signal, redirect: 'follow' };
                const res = await fetch(target, init);
                const text = await res.text();
                const response = new HttpResponse({ status: res.status, headers: res.headers, text, url: target }, { method, url: target, headers, body: data }, Date.now() - started);
                await record(response);
                return response;
            } catch (e: any) {
                await recordFailure({ method, url: target, headers, body: data });
                throw new ConnectionException(e?.cause?.message ?? e?.message ?? 'Connection failed');
            } finally {
                clearTimeout(timer);
            }
        };

        let last: unknown;
        for (let i = 0; i <= this.retries; i++) {
            try {
                return await attempt();
            } catch (e) {
                last = e;
            }
        }
        throw last;
    }
}

function flatten(data: Record<string, any>, prefix = ''): [string, string][] {
    const out: [string, string][] = [];
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' && x !== null ? out.push(...flatten(x, `${key}[${i}]`)) : out.push([`${key}[${i}]`, String(x)])));
        else if (typeof v === 'object') out.push(...flatten(v, key));
        else out.push([key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)]);
    }
    return out;
}

/* ---- debug logging (App\Listeners\RequestListener) ---- */

const HIDDEN = ['authorization', 'password', 'password_confirmation'];

function hide(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const copy: any = Array.isArray(data) ? [...data] : { ...data };
    for (const k of Object.keys(copy)) if (HIDDEN.includes(k.toLowerCase()) && copy[k]) copy[k] = '********';
    return copy;
}

async function record(res: HttpResponse) {
    if (!setting('debug', false)) return;
    try {
        const { DebugLog } = await import('./models/DebugLog');
        const ct = res.header('content-type').toLowerCase();
        const content = res.body();
        let response: any;
        const json = res.json();
        if (json !== null && typeof json === 'object') response = content.length / 1000 <= 64 ? hide(json) : 'Hidden Content';
        else if (ct.startsWith('text/plain')) response = content.length / 1000 <= 64 ? content : 'Hidden Content';
        else if (res.redirect()) response = `Redirected to ${res.header('location')}`;
        else if (!content) response = 'Empty Response';
        else response = 'HTML Response';
        await DebugLog.create({
            type: 'http',
            context: {
                method: res.request.method.toUpperCase(),
                url: res.request.url,
                headers: hide(Object.fromEntries(Object.entries(res.request.headers).map(([k, v]) => [k.toLowerCase(), v]))),
                payload: hide(res.request.body),
                response_status: res.status(),
                response_headers: hide(Object.fromEntries([...res.headers().entries()])),
                response,
                duration: res.durationMs,
            },
        });
    } catch {
        /* never fail a request because of logging */
    }
}

async function recordFailure(req: { method: string; url: string; headers: Record<string, string>; body?: any }) {
    if (!setting('debug', false)) return;
    try {
        const { DebugLog } = await import('./models/DebugLog');
        await DebugLog.create({
            type: 'http',
            context: { method: req.method.toUpperCase(), url: req.url, headers: hide(req.headers), payload: hide(req.body), response: 'Connection Failed' },
        });
    } catch {
        /* ignore */
    }
}

export const Http = {
    withHeaders: (h: Record<string, string>) => new PendingRequest().withHeaders(h),
    withToken: (t: string, type?: string) => new PendingRequest().withToken(t, type),
    withBasicAuth: (u: string, p: string) => new PendingRequest().withBasicAuth(u, p),
    acceptJson: () => new PendingRequest().acceptJson(),
    asJson: () => new PendingRequest().asJson(),
    asForm: () => new PendingRequest().asForm(),
    baseUrl: (u: string) => new PendingRequest().baseUrl(u),
    timeout: (s: number) => new PendingRequest().timeout(s),
    withoutVerifying: () => new PendingRequest().withoutVerifying(),
    get: (url: string, q?: Record<string, any>) => new PendingRequest().get(url, q),
    post: (url: string, d?: any) => new PendingRequest().post(url, d),
    put: (url: string, d?: any) => new PendingRequest().put(url, d),
    patch: (url: string, d?: any) => new PendingRequest().patch(url, d),
    delete: (url: string, d?: any) => new PendingRequest().delete(url, d),
};
