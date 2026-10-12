import type { ReactNode } from 'react';
import { initRequest } from '@/server/page';
import { ValidationError } from '@/server/validation';
import { adminRequest, resolveHost } from '../router';
import { runAdmin } from '../context';
import { collectNotifications } from '../Notification';
import type { AdminActionResult, AdminOp, FormTarget } from '../protocol';
import type { Host, ActionRef } from '../core/host';
import { fillForm, normalizeInput, validateForm, dehydrateForm, diffState } from '../forms/process';
import type { Select } from '../forms/fields/Select';
import { buildActionForm, renderActionModal } from '../actions/modal';
import { Halt, Cancel, Download, type ActionContext } from '../actions/Action';
import { relativeUrl } from '@/server/routes';

export async function handleDispatch(url: string, op: AdminOp): Promise<AdminActionResult> {
    const parsed = new URL(url, 'http://localhost');
    const searchParams: Record<string, string | string[] | undefined> = {};
    for (const key of new Set(parsed.searchParams.keys())) {
        const all = parsed.searchParams.getAll(key);
        searchParams[key] = all.length > 1 ? all : all[0];
    }
    const pathname = parsed.pathname;

    const { user } = await initRequest();
    if (!user || !(await user.canAccessAdmin())) return { ok: false, redirect: '/login' };

    const segments = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
    const ctx = await adminRequest(user, pathname, searchParams);

    return runAdmin(ctx, async () => {
        const resolved = await resolveHost(segments, user, pathname, searchParams);
        if (!resolved) return { ok: false };
        const { result, notifications } = await collectNotifications(() => run(resolved.host, op));
        return { ...result, notifications: [...(result.notifications ?? []), ...notifications] };
    });
}

async function run(host: Host, op: AdminOp): Promise<AdminActionResult> {
    try {
        switch (op.type) {
            case 'refresh':
                return await refresh(host, op.target, op.state, op.changed, op.mutate, op.old);
            case 'submit':
                return op.target.kind === 'form' ? await host.submitForm(op.target.id, op.state, op.target.args) : await submitAction(host, op.target, op.state);
            case 'mount':
                return await mount(host, op.action, op.args ?? {}, op.records, op.state);
            case 'call':
                return await call(host, op.action, op.args ?? {}, op.records, op.state);
            case 'options':
                return await options(host, op.target, op.state, op.path, op.search, op.values);
            case 'table':
                return await host.tableUpdate(op.table, op.action, { record: op.record, column: op.column, value: op.value, order: op.order });
            case 'page':
                return await host.callMethod(op.method, op.args ?? [], op.state);
            case 'widget': {
                const Class = (await host.getWidgetClasses()).find((w: any) => w.widgetId === op.widget);
                if (!Class) return { ok: false };
                const widget = new Class();
                widget.user = host.user;
                widget.livewire = host;
                widget.record = (host as any).record ?? null;
                const data = await widget.callMethod(op.method, op.args ?? []);
                return { ok: true, data, events: widget.dispatchedEvents() };
            }
        }
    } catch (e) {
        if (e instanceof ValidationError) return { ok: false, errors: e.errors };
        throw e;
    }
}

/* ---- forms ---- */

async function formFor(host: Host, target: FormTarget, state: Record<string, any>) {
    if (target.kind === 'form') {
        const form = await host.getForm(target.id, state);
        if (!form) throw new Error(`Unknown form ${target.id}`);
        return { schema: form.schema, rc: form.rc, ref: null as ActionRef | null };
    }
    const ref = await host.findAction(target.action);
    if (!ref) throw new Error(`Unknown action ${target.action}`);
    ref.ctx = { ...ref.ctx, arguments: target.args ?? {}, records: await recordsFor(ref, target.records) };
    const { schema, rc } = await buildActionForm(host, ref, normalizeInput(state));
    return { schema, rc, ref };
}

async function recordsFor(ref: ActionRef, keys?: Array<string | number>) {
    if (!keys || keys.length === 0 || !ref.ctx.model) return ref.ctx.records;
    const model = ref.ctx.model;
    return model.query().whereIn(model.primaryKey ?? 'id', keys as any[]).get();
}

/** a live field changed: run `afterStateUpdated`, return the patches and the re-rendered schema */
async function refresh(host: Host, target: FormTarget, state: Record<string, any>, changed: string | null, mutate?: Extract<AdminOp, { type: 'refresh' }>['mutate'], old?: unknown): Promise<AdminActionResult> {
    const { schema, rc } = await formFor(host, target, normalizeInput(state));
    const before = structuredClone(rc.state);
    if (mutate) {
        const found = await schema.findByStatePath(rc, mutate.path);
        const repeater = found?.component as unknown as { mutate?: (rc: any, m: any) => Promise<void> } | undefined;
        if (!found || !repeater?.mutate) return { ok: false };
        await repeater.mutate(found.rc, mutate);
        // the whole state of the form changed (an item went away), so it is replaced rather than patched
        return { ok: true, state: structuredClone(rc.state), schema: await schema.render(rc) };
    }
    if (changed) {
        const found = await schema.findByStatePath(rc, changed);
        if (found) await found.component.runAfterStateUpdated(found.rc, old);
    }
    await schema.hydrateDefaults(rc, rc.state, true);
    return { ok: true, patches: diffState(before, rc.state), schema: await schema.render(rc) };
}

async function options(host: Host, target: FormTarget, state: Record<string, any>, path: string, search?: string, values?: Array<string | number>): Promise<AdminActionResult> {
    const { schema, rc } = await formFor(host, target, normalizeInput(state));
    const found = await schema.findByStatePath(rc, path);
    const component = found?.component as unknown as Select | undefined;
    if (!found || !component || typeof (component as any).optionsFor !== 'function') return { ok: false };
    return { ok: true, options: await component.optionsFor(found.rc, search, values) };
}

/* ---- actions ---- */

async function resolveAction(host: Host, id: string, args: Record<string, any>, keys?: Array<string | number>, state?: Record<string, any>) {
    const ref = await host.findAction(id, state ? normalizeInput(state) : undefined);
    if (!ref) return null;
    const ctx: ActionContext = { ...ref.ctx, action: ref.action, arguments: { ...ref.action.getArguments(), ...args } };
    ctx.records = await recordsFor({ ...ref, ctx }, keys);
    ref.ctx = ctx;
    if (!(await ref.action.isVisible(ctx)) || (await ref.action.isDisabled(ctx))) return null;
    return ref;
}

async function mount(host: Host, id: string, args: Record<string, any>, keys?: Array<string | number>, state?: Record<string, any>): Promise<AdminActionResult> {
    const ref = await resolveAction(host, id, args, keys, state);
    if (!ref) return { ok: false };
    if (!ref.action.shouldOpenModal()) return execute(host, ref, {}, {});
    return { ok: true, modal: await renderActionModal({ host, ref, actionId: id, args, records: keys }) as ReactNode };
}

async function call(host: Host, id: string, args: Record<string, any>, keys?: Array<string | number>, state?: Record<string, any>): Promise<AdminActionResult> {
    const ref = await resolveAction(host, id, args, keys, state);
    if (!ref) return { ok: false };
    return execute(host, ref, {}, args);
}

/** the submit of an action's modal: validate the form, then run the action with the data */
async function submitAction(host: Host, target: Extract<FormTarget, { kind: 'action' }>, state: Record<string, any>): Promise<AdminActionResult> {
    const ref = await resolveAction(host, target.action, target.args ?? {}, target.records);
    if (!ref) return { ok: false };
    const { schema, rc } = await buildActionForm(host, ref, normalizeInput(state));
    let data: Record<string, any> = {};
    if (schema.getFlatComponents().length) {
        const errors = await validateForm(schema, rc);
        if (errors) return { ok: false, errors };
        data = await dehydrateForm(schema, rc);
        data = await ref.action.mutateFormData(data, ref.ctx);
    }
    const result = await execute(host, ref, data, target.args ?? {}, schema.getFlatComponents().length ? { formSchema: schema, formRc: rc } : {});
    if (target.args?.another && result.ok && !result.halted) {
        const fresh = buildActionForm(host, ref, {});
        const { schema: s, rc: r } = await fresh;
        const next = await fillForm(s, r, null);
        return { ...result, close: false, state: next, schema: await s.render(r) };
    }
    return result;
}

async function execute(host: Host, ref: ActionRef, data: Record<string, any>, args: Record<string, any>, form: { formSchema?: any; formRc?: any } = {}): Promise<AdminActionResult> {
    void host;
    const ctx: ActionContext = { ...ref.ctx, data, arguments: { ...(ref.ctx.arguments ?? {}), ...args }, ...form };
    const before = ref.rc ? structuredClone(ref.rc.state) : null;
    const outcome = await ref.action.execute(ctx);
    // `$set()` calls of a field action change the state of the form
    const patches = ref.rc && before ? diffState(before, ref.rc.state) : undefined;
    if (outcome.halted) return { ok: true, halted: true };
    if (outcome.cancelled) return { ok: true, close: true };
    const redirect = await ref.action.getSuccessRedirectUrl({ ...ctx, result: outcome.result });
    const schema = ref.rc && ref.schema ? await ref.schema.render(ref.rc) : undefined;
    const download = outcome.result instanceof Download ? { name: outcome.result.name, mime: outcome.result.mime, base64: Buffer.from(outcome.result.content as any).toString('base64') } : undefined;
    return { ok: true, close: true, refresh: ref.rc || download ? false : !redirect, redirect: redirect ? relativeUrl(redirect) : null, patches, schema, download };
}

export { Halt, Cancel };
