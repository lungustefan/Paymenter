import http from 'node:http';
import https from 'node:https';

type Bag = Record<string, any>;

export class ProxmoxError extends Error {
    constructor(
        message: string,
        public status = 0,
    ) {
        super(message);
        this.name = 'ProxmoxError';
    }
}

export interface ProxmoxConfig {
    host: string;
    port?: string | number | null;
    auth_type?: string | null; // 'token' | 'ticket'
    username?: string | null; // user@realm
    token_id?: string | null;
    token_secret?: string | null;
    password?: string | null;
    verify_ssl?: boolean | string | null;
    timeout?: number;
}

const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

/** Flattens a body to application/x-www-form-urlencoded (the format the Proxmox API expects). */
export function formEncode(data: Bag): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null) continue;
        p.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    return p.toString();
}

/**
 * Minimal Proxmox VE API client (`/api2/json`). Authenticates with an API token
 * (`PVEAPIToken=user@realm!id=secret`) or with a ticket (`PVEAuthCookie` + CSRF token,
 * fetched lazily and renewed on a 401).
 */
export class ProxmoxClient {
    private ticket: { ticket: string; csrf: string } | null = null;

    constructor(private cfg: ProxmoxConfig) {}

    get baseUrl(): string {
        let host = String(this.cfg.host ?? '').trim().replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(host)) host = 'https://' + host;
        const url = new URL(host);
        if (!url.port) url.port = String(this.cfg.port || 8006);
        return url.origin;
    }

    private raw(method: string, path: string, body: string | null, headers: Record<string, string>): Promise<{ status: number; text: string }> {
        const url = new URL(this.baseUrl + '/api2/json' + path);
        const lib = url.protocol === 'https:' ? https : http;
        return new Promise((resolve, reject) => {
            const req = lib.request(
                url,
                {
                    method,
                    headers: { Accept: 'application/json', ...headers, ...(body !== null ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
                    rejectUnauthorized: this.cfg.verify_ssl === undefined || this.cfg.verify_ssl === null ? true : truthy(this.cfg.verify_ssl),
                    timeout: (this.cfg.timeout ?? 30) * 1000,
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
                },
            );
            req.on('timeout', () => req.destroy(new Error('Request timed out')));
            req.on('error', (e) => reject(new ProxmoxError('Unable to reach Proxmox: ' + e.message)));
            if (body !== null) req.write(body);
            req.end();
        });
    }

    private async login(): Promise<{ ticket: string; csrf: string }> {
        const res = await this.raw('POST', '/access/ticket', formEncode({ username: this.cfg.username, password: this.cfg.password }), { 'Content-Type': 'application/x-www-form-urlencoded' });
        let json: any = null;
        try {
            json = JSON.parse(res.text);
        } catch {
            /* handled below */
        }
        if (res.status !== 200 || !json?.data?.ticket) throw new ProxmoxError('Proxmox login failed (HTTP ' + res.status + ')', res.status);
        this.ticket = { ticket: json.data.ticket, csrf: json.data.CSRFPreventionToken };
        return this.ticket;
    }

    private async authHeaders(method: string): Promise<Record<string, string>> {
        if ((this.cfg.auth_type ?? 'token') === 'ticket') {
            const t = this.ticket ?? (await this.login());
            const h: Record<string, string> = { Cookie: 'PVEAuthCookie=' + encodeURIComponent(t.ticket) };
            if (method !== 'GET') h.CSRFPreventionToken = t.csrf;
            return h;
        }
        return { Authorization: `PVEAPIToken=${this.cfg.username}!${this.cfg.token_id}=${this.cfg.token_secret}` };
    }

    /** Performs a request and returns the `data` member of the response. */
    async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data: Bag = {}, retried = false): Promise<T> {
        let target = path;
        let body: string | null = null;
        const encoded = formEncode(data);
        if (method === 'GET' || method === 'DELETE') {
            if (encoded) target += '?' + encoded;
        } else {
            body = encoded;
        }
        const headers = { ...(await this.authHeaders(method)), ...(body !== null ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) };
        const res = await this.raw(method, target, body, headers);
        if (res.status === 401 && !retried && (this.cfg.auth_type ?? 'token') === 'ticket') {
            this.ticket = null;
            return this.request(method, path, data, true);
        }
        let json: any = null;
        try {
            json = JSON.parse(res.text);
        } catch {
            /* not json */
        }
        if (res.status < 200 || res.status >= 300) {
            let message = res.text.slice(0, 300);
            if (json?.errors && typeof json.errors === 'object') message = Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join('; ');
            else if (json?.message) message = String(json.message);
            throw new ProxmoxError(`Proxmox API error ${res.status}: ${message}`, res.status);
        }
        return (json?.data ?? null) as T;
    }

    get = <T = any>(path: string, data?: Bag) => this.request<T>('GET', path, data);
    post = <T = any>(path: string, data?: Bag) => this.request<T>('POST', path, data);
    put = <T = any>(path: string, data?: Bag) => this.request<T>('PUT', path, data);
    delete = <T = any>(path: string, data?: Bag) => this.request<T>('DELETE', path, data);

    /**
     * Waits for a task (UPID) to finish; throws when it ends with anything but `OK`.
     * Returns immediately for non task results (e.g. `null` from a synchronous call).
     */
    async waitForTask(node: string, upid: unknown, { timeoutMs = 90_000, intervalMs = 1000 }: { timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
        if (typeof upid !== 'string' || !upid.startsWith('UPID:')) return;
        const started = Date.now();
        for (;;) {
            const status = await this.get<Bag>(`/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
            if (status?.status === 'stopped') {
                if (status.exitstatus && status.exitstatus !== 'OK') throw new ProxmoxError('Proxmox task failed: ' + status.exitstatus);
                return;
            }
            if (Date.now() - started > timeoutMs) throw new ProxmoxError('Timed out waiting for the Proxmox task to finish');
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }

    /* ---- convenience wrappers ---- */
    nodes = () => this.get<Bag[]>('/nodes');
    nextId = async () => Number(await this.get('/cluster/nextid'));
    vm = (node: string, vmid: number | string) => `/nodes/${node}/qemu/${vmid}`;
    status = (node: string, vmid: number | string) => this.get<Bag>(`${this.vm(node, vmid)}/status/current`);
    config = (node: string, vmid: number | string) => this.get<Bag>(`${this.vm(node, vmid)}/config`);
    setConfig = (node: string, vmid: number | string, data: Bag) => this.put(`${this.vm(node, vmid)}/config`, data);
    power = (node: string, vmid: number | string, action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'reset' | 'suspend' | 'resume') => this.post<string>(`${this.vm(node, vmid)}/status/${action}`);
}
