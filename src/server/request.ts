/**
 * Request-scoped information that domain code needs (client IP, URL, user
 * agent). Under Next.js it is read from the incoming request headers; in the
 * CLI / queue worker there is no request, which Laravel calls "running in
 * console" (auditing and some listeners behave differently there).
 */
export interface RequestInfo {
    ip: string | null;
    userAgent: string | null;
    /** full URL of the page that triggered the action, without query string */
    url: string | null;
    host: string | null;
    runningInConsole: boolean;
}

const consoleInfo: RequestInfo = { ip: null, userAgent: null, url: 'console', host: null, runningInConsole: true };

export async function getRequestInfo(): Promise<RequestInfo> {
    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const forwarded = h.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() : (h.get('x-real-ip') ?? null);
        const proto = h.get('x-forwarded-proto') ?? 'http';
        const host = h.get('x-forwarded-host') ?? h.get('host');
        // `x-paymenter-url` is set by the proxy middleware with the pathname of the current page
        const path = h.get('x-paymenter-path') ?? '';
        return {
            ip,
            userAgent: h.get('user-agent'),
            url: host ? `${proto}://${host}${path}` : null,
            host,
            runningInConsole: false,
        };
    } catch {
        return consoleInfo;
    }
}

export function isRunningInConsole(): Promise<boolean> {
    return getRequestInfo().then((r) => r.runningInConsole);
}
