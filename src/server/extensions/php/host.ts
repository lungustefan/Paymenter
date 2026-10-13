import { cacheForget, cacheGet, cachePut } from '@/server/cache';
import { config, setting } from '@/server/config';
import { dispatch } from '@/server/events';
import { PendingRequest, ConnectionException } from '@/server/http';
import { t } from '@/server/i18n';
import { Model } from '@/server/orm';
import { resolveMorph } from '@/server/orm/registry';
import { route, routeTable, url } from '@/server/routes';
import { getCurrentUser } from '@/server/auth/session';
import { InvoiceTransactionStatus } from '@/server/enums';
import { ExtensionHelper } from '../helper';
import { adminResources, adminResourceUrl } from '@/server/admin/resources';
import type { PhpBridge } from './bridge';
import { marshal } from './marshal';

/** builder methods of the Laravel HTTP client the shim may replay (everything else is rejected) */
const BUILDERS = new Set(['withHeaders', 'withHeader', 'withToken', 'withBasicAuth', 'accept', 'acceptJson', 'contentType', 'asJson', 'asForm', 'asMultipart', 'withBody', 'timeout', 'baseUrl', 'retry', 'withoutVerifying']);
const VERBS = new Set(['get', 'head', 'post', 'put', 'patch', 'delete']);

const modelFor = (name: string) => {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('Invalid model');
    const ctor = resolveMorph(`App\\Models\\${name}`);
    if (!ctor) throw new Error(`Model ${name} is not available to PHP extensions`);
    return ctor;
};

export function registerHostHandlers(bridge: PhpBridge) {
    bridge.onHost('http', async (p: { calls: [string, any[]][]; method: string; url: string; data: any }) => {
        let req: any = new PendingRequest();
        for (const [m, args] of p.calls ?? []) {
            if (!BUILDERS.has(m)) throw new Error(`Http::${m}() is not supported`);
            req = req[m](...(args ?? []));
        }
        if (!VERBS.has(p.method)) throw new Error('Invalid HTTP verb');
        try {
            // PHP arrays: an empty one is `[]` in JSON but Laravel's client sends `{}`
            const data = Array.isArray(p.data) && p.data.length === 0 ? {} : (p.data ?? undefined);
            const res = await req[p.method](p.url, data);
            const headers: Record<string, string> = {};
            res.headers().forEach((v: string, k: string) => (headers[k] = v));
            return { status: res.status(), headers, body: res.body() };
        } catch (e: any) {
            if (e instanceof ConnectionException || e?.name === 'ConnectionException') return { connectionError: e.message };
            throw e;
        }
    });

    bridge.onHost('log', ({ level, message, context }: any) => {
        const fn = ['error', 'critical', 'alert', 'emergency'].includes(level) ? console.error : ['warning', 'warn', 'notice'].includes(level) ? console.warn : console.log;
        fn(`[php-extension:${level}] ${message}`, context && Object.keys(context).length ? context : '');
    });
    bridge.onHost('cache.get', async ({ key }: any) => {
        const value = await cacheGet(String(key));
        return { hit: value !== null && value !== undefined, value };
    });
    bridge.onHost('cache.put', ({ key, value, ttl }: any) => cachePut(String(key), value, ttl ?? undefined));
    bridge.onHost('cache.forget', ({ key }: any) => cacheForget(String(key)));
    bridge.onHost('config', ({ key }: any) => (key ? config(String(key), null) : null));
    bridge.onHost('setting', ({ key }: any) => (key ? setting(String(key), null) : null));
    bridge.onHost('url', ({ path }: any) => url(String(path)));
    bridge.onHost('route', ({ name, params, absolute }: any) => route(String(name), params ?? {}, absolute !== false));
    bridge.onHost('route.has', ({ name }: any) => String(name) in routeTable);
    bridge.onHost('trans', ({ key, replace }: any) => (key ? t(String(key), replace ?? {}) : null));
    bridge.onHost('auth', async () => {
        const user = await getCurrentUser().catch(() => null);
        return user ? marshal(user) : null;
    });
    bridge.onHost('event.dispatch', async ({ event, payload }: any) => {
        await dispatch(String(event), payload ?? {});
        return null;
    });

    bridge.onHost('admin.resource', ({ resource, page, record }: any) => {
        const info = (adminResources as Record<string, any>)[String(resource)];
        if (!info) throw new Error(`The admin resource ${resource} does not exist on this panel`);
        return adminResourceUrl(info, page, record ?? undefined);
    });
    bridge.onHost('admin.label', ({ resource }: any) => (adminResources as Record<string, any>)[String(resource)]?.modelLabel ?? String(resource));

    // read-only model access for `Model::find()` / `->where()->first()` and lazy relations
    bridge.onHost('query', async ({ model, wheres, op }: any) => {
        const C = modelFor(model);
        let q: any = C.query();
        for (const [k, v] of Object.entries(wheres ?? {})) {
            if (!/^[A-Za-z0-9_]+$/.test(k)) throw new Error('Invalid column');
            q = q.where(k, v as any);
        }
        if (op === 'first') {
            const row = await q.first();
            return row ? marshal(row) : null;
        }
        const rows = await q.limit(500).get();
        return Promise.all(rows.map((r: Model<any>) => marshal(r)));
    });
    bridge.onHost('relation', async ({ model, id, name }: any) => {
        const C = modelFor(model);
        const row: any = await C.query().where('id', id).first();
        if (!row || !/^[A-Za-z0-9_]+$/.test(String(name))) return { found: false };
        if (!row.relationDef(name)) {
            // computed attribute (`$user->name`)
            const accessors: string[] = (C as any).accessors ?? [];
            if (accessors.includes(name) || name in ((C as any).accessorMap ?? {})) return { found: true, value: await marshal(await row.getAttribute(name)) };
            return { found: false };
        }
        const related = await row.rel(name);
        return { found: true, value: Array.isArray(related) ? await Promise.all(related.map((r: Model<any>) => marshal(r))) : related ? await marshal(related) : null };
    });

    // ExtensionHelper payment hooks
    const statuses: Record<string, InvoiceTransactionStatus> = {
        succeeded: InvoiceTransactionStatus.Succeeded,
        processing: InvoiceTransactionStatus.Processing,
        failed: InvoiceTransactionStatus.Failed,
    };
    bridge.onHost('addPayment', async (p: any) => {
        const tx = await ExtensionHelper.addPayment(Number(p.invoice), p.gateway, Number(p.amount), p.fee === null || p.fee === undefined ? null : Number(p.fee), p.transactionId ?? null, statuses[p.status] ?? InvoiceTransactionStatus.Succeeded, !!p.isCredit);
        return marshal(tx);
    });
    bridge.onHost('addPaymentFee', async (p: any) => marshal(await ExtensionHelper.addPaymentFee(String(p.transactionId), Number(p.fee))));
    bridge.onHost('makeBillingAgreement', async (p: any) => {
        const { User } = await import('@/server/models/User');
        const user = await User.query().where('id', p.user).firstOrFail();
        return marshal(await ExtensionHelper.makeBillingAgreement(user as any, p.gateway, p.name, p.externalReference, p.type ?? null, p.expiry ?? null));
    });
}
