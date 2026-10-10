import type { Model } from '@/server/orm';
import type { User } from '@/server/models/User';
import { validate, ValidationError } from '@/server/validation';
import { makeTranslator } from '@/server/i18n';
import { adminContext } from '../context';
import type { RenderContext } from './Component';
import { getPath, setPath } from '../core/evaluate';
import type { Schema } from './Schema';
import { flatten } from './flatten';

export interface RcInit {
    state?: Record<string, any>;
    operation: string;
    record?: Model<any> | null;
    model?: any;
    user: User;
    livewire?: any;
    formId?: string;
    extra?: Record<string, any>;
    container?: string;
}

export function makeRenderContext(init: RcInit): RenderContext {
    return {
        state: init.state ?? {},
        errors: {},
        operation: init.operation,
        record: init.record ?? null,
        model: init.model,
        user: init.user,
        livewire: init.livewire,
        formId: init.formId ?? 'form',
        container: init.container ?? '',
        extra: init.extra ?? {},
    };
}

const UNTRIMMED = new Set(['current_password', 'password', 'password_confirmation']);

/** `TrimStrings` + `ConvertEmptyStringsToNull`: the global middleware every Livewire request goes through */
export function normalizeInput<T>(value: T, key = ''): T {
    if (typeof value === 'string') {
        const trimmed = UNTRIMMED.has(key) ? value : value.trim();
        return (trimmed === '' ? null : trimmed) as any;
    }
    if (Array.isArray(value)) return value.map((v) => normalizeInput(v)) as any;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = normalizeInput(v, k);
        return out as any;
    }
    return value;
}

/** `$schema->fill($data)`: `null` fills the defaults (create), data fills the record (edit) */
export async function fillForm(schema: Schema, rc: RenderContext, data: Record<string, any> | null): Promise<Record<string, any>> {
    rc.state = data ? structuredCloneSafe(data) : {};
    await schema.hydrateDefaults(rc, rc.state, data === null);
    if (rc.record) await schema.loadRelationshipState(rc, rc.record, rc.state);
    for (const c of await schema.getAllComponents(rc)) await c.runAfterStateHydrated(rc);
    return rc.state;
}

function structuredCloneSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

/** `$schema->validate()`: the validation errors by state path, or `null` when the state is valid */
export async function validateForm(schema: Schema, rc: RenderContext): Promise<Record<string, string[]> | null> {
    const rules: Record<string, any[]> = {};
    const attributes: Record<string, string> = {};
    await schema.collectRules(rc, rules, attributes);
    const { tr } = adminContext();
    try {
        await validate(rc.state, rules as any, { locale: tr.locale, attributes });
        return null;
    } catch (e) {
        if (e instanceof ValidationError) return e.errors;
        throw e;
    }
}

/** `$schema->getState()` after a successful validation */
export async function dehydrateForm(schema: Schema, rc: RenderContext): Promise<Record<string, any>> {
    return schema.dehydrate(rc);
}

/** what changed between two states (leaf paths) - `$set()` calls made by hooks */
export function diffState(before: Record<string, any>, after: Record<string, any>): Record<string, any> {
    const a = flatten(before);
    const b = flatten(after);
    const patches: Record<string, any> = {};
    for (const [path, value] of Object.entries(b)) if (JSON.stringify(a[path]) !== JSON.stringify(value)) patches[path] = value;
    for (const path of Object.keys(a)) if (!(path in b)) patches[path] = null;
    return patches;
}

export { getPath, setPath, makeTranslator };
