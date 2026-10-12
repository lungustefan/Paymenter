import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../helpers/db';
import { createInvoice, createProduct, createService, createUser } from '../helpers/factories';
import { Events } from '@/server/event-defs';
import { dispatch, forgetListeners } from '@/server/events';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { Invoice } from '@/server/models/Invoice';
import { Extension as ExtensionModel } from '@/server/models/Extension';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'php-extensions');
process.env.PAYMENTER_EXTENSIONS_DIR = FIXTURES;

interface Logged {
    method: string;
    url: string;
    auth?: string;
    body: any;
}

/** a stub HTTP server that plays Pterodactyl / Mollie / Discord and records what it was asked */
function startStub() {
    const log: Logged[] = [];
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            let body: any = raw;
            try {
                body = raw ? JSON.parse(raw) : null;
            } catch {
                /* form or text */
            }
            log.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body });
            const send = (status: number, data: any) => {
                res.writeHead(status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(data));
            };
            const u = req.url!;
            if (u.startsWith('/api/application/servers/external/')) return send(200, { attributes: { id: 42, identifier: 'abc123', allocation: 5, container: { environment: {}, image: 'img', startup_command: 'run' } } });
            if (u.startsWith('/api/application/nests/1/eggs/2')) return send(200, { attributes: { docker_image: 'ghcr.io/x', startup: 'java -jar', relationships: { variables: { data: [{ attributes: { env_variable: 'VERSION', default_value: 'latest' } }] } } } });
            if (u.startsWith('/api/application/users')) return send(200, { data: [{ attributes: { id: 7 } }] });
            if (u.startsWith('/api/application/servers') && req.method === 'POST') return send(201, { attributes: { id: 42, identifier: 'abc123' } });
            if (u.startsWith('/api/application/servers/42')) return send(204, {});
            if (u.startsWith('/v2/payments/tr_1')) return send(200, { id: 'tr_1', status: 'paid', amount: { value: '12.50' }, metadata: { invoice_id: 1 } });
            if (u.startsWith('/v2/payments')) return send(201, { _links: { checkout: { href: 'https://pay.mollie.test/checkout/xyz' } } });
            return send(200, {});
        });
    });
    return new Promise<{ url: string; log: Logged[]; close: () => Promise<void> }>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, log, close: () => new Promise((r) => server.close(() => r())) })),
    );
}

describe('PHP bridge', () => {
    useDatabase();
    let stub: Awaited<ReturnType<typeof startStub>>;
    const realFetch = globalThis.fetch;

    beforeAll(async () => {
        stub = await startStub();
        // hard-coded API hosts (api.mollie.com) are redirected to the stub
        vi.stubGlobal('fetch', (input: any, init?: any) => realFetch(String(input).replace('https://api.mollie.com', stub.url), init));
    });
    afterAll(async () => {
        vi.unstubAllGlobals();
        const { stopPhpBridge } = await import('@/server/extensions/php/runtime');
        stopPhpBridge();
        await stub.close();
    });

    const phpClass = async (type: string, name: string) => {
        const { discoverPhpExtensions } = await import('@/server/extensions/php/discovery');
        const { getPhpBridge } = await import('@/server/extensions/php/runtime');
        const { createPhpExtensionClass } = await import('@/server/extensions/php/PhpExtension');
        const info = discoverPhpExtensions().find((e) => e.type === type && e.name === name)!;
        const desc = await getPhpBridge().call('describe', { type, name });
        return createPhpExtensionClass(info, desc) as any;
    };

    it('discovers upstream-layout extensions, with metadata and diagnostics', async () => {
        const { discoverPhpExtensions } = await import('@/server/extensions/php/discovery');
        const found = discoverPhpExtensions().map((e) => `${e.type}:${e.name}`);
        expect(found).toEqual(expect.arrayContaining(['gateway:Mollie', 'gateway:PayPal_IPN', 'server:Pterodactyl', 'other:DiscordNotifications', 'other:WarnDemo']));
        expect(discoverPhpExtensions().find((e) => e.name === 'WarnDemo')!.warnings.join(' ')).toMatch(/Filament admin resources/);

        const Warn = await phpClass('other', 'WarnDemo');
        expect(Warn.meta).toMatchObject({ name: 'Warn Demo', version: '1.2.3', author: 'Tester' });
        const w = new Warn({ greeting: 'hello' });
        expect(await w.hello('big world')).toBe('HelloBigWorld');
        expect(await w.collection()).toEqual([2, 4, 6]);
        expect(await w.getConfig()).toEqual([{ name: 'greeting', type: 'text', label: 'Greeting', hint: '<b>hi</b>', hintHtml: true }]);
        const Ipn = await phpClass('gateway', 'PayPal_IPN');
        expect(Ipn.meta.name).toBe('PayPal IPN');
    });

    it('runs the upstream Pterodactyl server extension like the TypeScript port', async () => {
        const user = await createUser({ email: 'customer@example.com' });
        const { product, plan } = await createProduct();
        const service = await createService({ user_id: user.id, plan_id: plan.id, product_id: product.id, status: 'pending' });
        const config = { host: stub.url, api_key: 'secret-key' };
        const settings = { nest_id: 1, egg_id: 2, memory: 1024, swap: 0, disk: 5000, io: 500, cpu: 100, databases: 1, backups: 2, additional_allocations: 0, location: 3, node: '' };

        const Php = await phpClass('server', 'Pterodactyl');
        const Ts = (await import('@extensions/Servers/Pterodactyl')).default as any;

        const runAll = async (Cls: any) => {
            const ext = new Cls(config);
            stub.log.length = 0;
            // the stub says "server exists" for GET /external/<id>, so the real create path needs it to 404 first
            const out: Record<string, any> = {};
            out.actions = await ext.getActions(service);
            out.suspend = await ext.suspendServer(service, settings, {});
            out.unsuspend = await ext.unsuspendServer(service, settings, {});
            out.terminate = await ext.terminateServer(service, settings, {});
            out.upgrade = await ext.upgradeServer(service, settings, {});
            out.test = await ext.testConfig();
            return { out, requests: stub.log.map((r) => ({ ...r })) };
        };
        const a = await runAll(Php);
        const b = await runAll(Ts);
        expect(a.out).toEqual(b.out);
        expect(a.out.actions).toEqual([{ type: 'button', label: 'Go to server', url: `${stub.url}/server/abc123` }]);
        expect(a.requests.length).toBeGreaterThan(8);
        expect(a.requests).toEqual(b.requests);
        expect(a.requests.every((r) => r.auth === 'Bearer secret-key')).toBe(true);

        // config forms: same field names, types and flags
        const strip = (fields: any[]) => fields.map((f) => ({ name: f.name, type: f.type, required: !!f.required, label: f.label }));
        expect(strip(await new Php(config).getConfig())).toEqual(strip(new Ts(config).getConfig()));
    });

    it('creates servers through the bridge (create path 404 -> POST) with the same payload as the port', async () => {
        const user = await createUser({ email: 'customer2@example.com' });
        const { product, plan } = await createProduct();
        const service = await createService({ user_id: user.id, plan_id: plan.id, product_id: product.id, status: 'pending' });
        const config = { host: stub.url, api_key: 'k' };
        const settings = { nest_id: 1, egg_id: 2, memory: 512, swap: 0, disk: 1000, io: 500, cpu: 50, databases: 0, backups: 0, additional_allocations: 0, location: 3, node: '', servername: 'srv' };
        const Php = await phpClass('server', 'Pterodactyl');
        const Ts = (await import('@extensions/Servers/Pterodactyl')).default as any;
        // GET /external/<id> must 404 so that createServer proceeds
        const mockMissing = vi.fn();
        void mockMissing;
        const origServer = (url: string) => url.includes('/servers/external/');
        const missing = vi.stubGlobal('fetch', async (input: any, init?: any) => {
            if (origServer(String(input)) && (init?.method ?? 'GET') === 'GET') {
                stub.log.push({ method: 'GET', url: new URL(String(input)).pathname + new URL(String(input)).search, auth: init?.headers?.Authorization, body: null });
                return new Response(JSON.stringify({ errors: [{ detail: 'not found' }] }), { status: 404, headers: { 'content-type': 'application/json' } });
            }
            return realFetch(String(input).replace('https://api.mollie.com', stub.url), init);
        });
        void missing;
        const run = async (Cls: any) => {
            stub.log.length = 0;
            await new Cls(config).createServer(service, settings, { VERSION: '1.21' });
            return stub.log.map((r) => ({ ...r }));
        };
        const a = await run(Php);
        const b = await run(Ts);
        expect(a.length).toBeGreaterThanOrEqual(4);
        const post = a.find((r) => r.method === 'POST' && r.url === '/api/application/servers')!;
        expect(post.body).toMatchObject({ name: 'srv', user: 7, egg: 2, deploy: { locations: [3] }, environment: { VERSION: '1.21' }, limits: { memory: 512 } });
        expect(a).toEqual(b);
        vi.stubGlobal('fetch', (input: any, init?: any) => realFetch(String(input).replace('https://api.mollie.com', stub.url), init));
    });

    it('runs the upstream Mollie gateway: pay(), routes and the webhook', async () => {
        const user = await createUser();
        const invoice = await createInvoice({ user_id: user.id, status: 'pending', currency_code: 'EUR' });
        await invoice.relation('items').create({ description: 'Thing', quantity: 1, price: 12.5 });
        const fresh = (await Invoice.find<Invoice>(invoice.id))!;
        const Php = await phpClass('gateway', 'Mollie');
        const Ts = (await import('@extensions/Gateways/Mollie')).default as any;

        await new Php({ api_key: 'mollie-key' }).boot();
        const pay = async (Cls: any) => {
            stub.log.length = 0;
            const url = await new Cls({ api_key: 'mollie-key' }).pay(fresh, 12.5);
            return { url, req: stub.log.map((r) => ({ ...r })) };
        };
        const a = await pay(Php);
        const b = await pay(Ts);
        expect(a.url).toBe('https://pay.mollie.test/checkout/xyz');
        expect(a).toEqual(b);
        expect(a.req[0].body.amount).toEqual({ currency: 'EUR', value: '12.50' });

        // routes.php is `require`d by boot(): the extension route is registered and served by PHP
        const php = new Php({ api_key: 'mollie-key' });
        await php.boot();
        const routes = php.routes();
        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({ method: 'POST', path: '/extensions/gateways/mollie/webhook', name: 'extensions.gateways.mollie.webhook' });
        const all = { id: 'tr_1' };
        const ctx = { request: new Request('http://localhost/extensions/gateways/mollie/webhook', { method: 'POST', body: JSON.stringify(all), headers: { 'content-type': 'application/json' } }), params: {}, query: new URLSearchParams(), instance: async () => php, text: async () => JSON.stringify(all), all: async () => all, ip: '127.0.0.1' } as any;
        const res = (await routes[0].handler(ctx)) as Response;
        expect(res.status).toBe(200);
        const tx = await InvoiceTransaction.query().where('transaction_id', 'tr_1').first();
        expect(tx).not.toBeNull();
        expect(Number(tx!.amount)).toBe(12.5);
    });

    it('forwards panel events to PHP listeners (Discord notifications)', async () => {
        const user = await createUser();
        const invoice = await createInvoice({ user_id: user.id, status: 'pending' });
        const Php = await phpClass('other', 'DiscordNotifications');
        const Ts = (await import('@extensions/Others/DiscordNotifications')).default as any;
        const config = { webhook_url: `${stub.url}/discord`, ping_type: 'none', ping_id: '', events: ['Invoice Paid'] };
        // the extension is installed + enabled with these settings (what the admin saved)
        const row = await ExtensionModel.create({ name: 'DiscordNotifications', type: 'other', extension: 'DiscordNotifications', enabled: true });
        for (const [key, value] of Object.entries(config)) await row.relation('settings').create({ key, value: Array.isArray(value) ? JSON.stringify(value) : value, type: Array.isArray(value) ? 'array' : 'string' });

        const fire = async (Cls: any) => {
            forgetListeners(Events.Invoice.Paid);
            stub.log.length = 0;
            await new Cls(config).boot();
            await dispatch(Events.Invoice.Paid, { invoice });
            return stub.log.filter((r) => r.url === '/discord').map((r) => r.body);
        };
        const a = await fire(Php);
        expect(a).toHaveLength(1);
        const b = await fire(Ts);
        const norm = (x: any[]) => x.map((m) => ({ ...m, embeds: m.embeds.map((e: any) => ({ ...e, timestamp: 'T' })) }));
        expect(norm(a)).toEqual(norm(b));
        expect(a[0].embeds[0].fields[0].name).toBe('Id');
        expect(a[0].embeds[0].fields[0].value).toContain(`/admin/invoices/${invoice.id}/edit`);
        forgetListeners(Events.Invoice.Paid);
    });

    it('reports what the shim cannot do instead of failing obscurely', async () => {
        const Blade = await phpClass('gateway', 'BladeGateway');
        const g = new Blade({});
        await expect(g.pay({ id: 1 }, 5)).rejects.toThrow(/Blade view "bladegateway::pay"/);
        await expect(g.charge({ id: 1 }, 5, {})).rejects.toThrow(/Class "?Illuminate\\Support\\Facades\\Mail"? not found|Mail/);
        // exceptions keep their PHP message; stray echo output does not break the protocol
        await expect(g.explode()).rejects.toThrow('boom from php');
        const Warn = await phpClass('other', 'WarnDemo');
        expect(await new Warn({ greeting: 'still' }).hello('works')).toBe('StillWorks');
    });

    it('degrades cleanly when php is not installed', async () => {
        const bridge = await import('@/server/extensions/php/bridge');
        const old = process.env.PHP_BIN;
        process.env.PHP_BIN = '/nonexistent/php';
        try {
            const a = bridge.phpAvailability(true);
            expect(a.ok).toBe(false);
            expect(a.reason).toMatch(/PHP CLI/);
            const p = new bridge.PhpBridge(FIXTURES, path.join(import.meta.dirname, '..', '..', 'php-bridge', 'bridge.php'));
            await expect(p.call('ping')).rejects.toMatchObject({ kind: 'unavailable' });
        } finally {
            if (old === undefined) delete process.env.PHP_BIN;
            else process.env.PHP_BIN = old;
            bridge.phpAvailability(true);
        }
    });

    it('rejects extension names that could escape the extensions folder', async () => {
        const { getPhpBridge } = await import('@/server/extensions/php/runtime');
        await expect(getPhpBridge().call('describe', { type: 'server', name: '../../etc/passwd' })).rejects.toThrow(/Invalid extension/);
        await expect(getPhpBridge().call('call', { type: 'other', name: 'WarnDemo', fn: '__construct', args: [] })).rejects.toThrow(/Invalid function/);
    });
});
