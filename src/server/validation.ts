import { t as translate, hasTranslation } from '@/server/i18n';
import { query } from '@/server/orm/raw';

/**
 * A pragmatic port of Laravel's validator covering the rules the application
 * (client area, admin panel and API) uses, with the same messages
 * (`lang/<locale>/validation.json`).
 */

export type RuleFn = (value: any, fail: (message: string) => void, ctx: { data: Record<string, any>; attribute: string }) => void | Promise<void>;
export type Rule = string | RuleFn;
export type Rules = Record<string, Rule | Rule[]>;

export class ValidationError extends Error {
    constructor(public errors: Record<string, string[]>) {
        super(Object.values(errors)[0]?.[0] ?? 'The given data was invalid.');
        this.name = 'ValidationError';
    }
}

export interface ValidateOptions {
    locale?: string;
    /** custom messages: `field.rule` or `rule` => text */
    messages?: Record<string, string>;
    /** display names for attributes */
    attributes?: Record<string, string>;
    /** resolver for `current_password` */
    checkCurrentPassword?: (password: string) => Promise<boolean>;
}

const isFile = (v: any): v is File => typeof File !== 'undefined' && v instanceof File;
const isBlank = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) || (isFile(v) && v.size === 0 && v.name === '');
const isNumeric = (v: any) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v.trim()));
const isIntLike = (v: any) => (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim()));

function getPath(data: any, path: string): any {
    return path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), data);
}

/** Expand `a.*.b` against the data into concrete attribute paths. */
function expand(pattern: string, data: any): string[] {
    if (!pattern.includes('*')) return [pattern];
    const parts = pattern.split('.');
    let paths = [''];
    for (const part of parts) {
        const next: string[] = [];
        for (const base of paths) {
            if (part === '*') {
                const node = base ? getPath(data, base) : data;
                if (Array.isArray(node)) node.forEach((_, i) => next.push(base ? `${base}.${i}` : String(i)));
                else if (node && typeof node === 'object') Object.keys(node).forEach((k) => next.push(base ? `${base}.${k}` : k));
            } else next.push(base ? `${base}.${part}` : part);
        }
        paths = next;
    }
    return paths;
}

function parseRule(rule: string): { name: string; params: string[] } {
    const idx = rule.indexOf(':');
    if (idx === -1) return { name: rule, params: [] };
    const name = rule.slice(0, idx);
    const raw = rule.slice(idx + 1);
    // regex / not_regex keep their commas
    return { name, params: name === 'regex' || name === 'not_regex' ? [raw] : raw.split(',') };
}

function sizeOf(value: any, hasNumeric: boolean): { size: number; type: 'numeric' | 'file' | 'string' | 'array' } {
    if (isFile(value)) return { size: value.size / 1024, type: 'file' };
    if (Array.isArray(value)) return { size: value.length, type: 'array' };
    if (hasNumeric || typeof value === 'number') return { size: Number(value), type: 'numeric' };
    return { size: [...String(value ?? '')].length, type: 'string' };
}

function isDateValid(v: any): boolean {
    if (v instanceof Date) return !Number.isNaN(v.getTime());
    if (typeof v !== 'string' && typeof v !== 'number') return false;
    return !Number.isNaN(new Date(v as any).getTime());
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp'];

export async function validate<T extends Record<string, any> = Record<string, any>>(data: Record<string, any>, rules: Rules, options: ValidateOptions = {}): Promise<T> {
    const errors: Record<string, string[]> = {};
    const validated: Record<string, any> = {};

    const trans = (key: string, replace: Record<string, unknown> = {}) => translate(key, replace, options.locale);

    const attributeName = (attr: string): string => {
        const lastWildcard = attr;
        const custom = options.attributes?.[attr] ?? options.attributes?.[attr.replace(/\.\d+(\.|$)/g, '.*$1')];
        if (custom) return custom;
        const key = `validation.attributes.${attr}`;
        if (hasTranslation(key, options.locale)) return trans(key);
        return lastWildcard.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/_/g, ' ');
    };

    const message = (attr: string, rule: string, replace: Record<string, unknown> = {}, typeKey?: string): string => {
        const wildcardAttr = attr.replace(/\.\d+(\.|$)/g, '.*$1');
        const custom = options.messages?.[`${attr}.${rule}`] ?? options.messages?.[`${wildcardAttr}.${rule}`] ?? options.messages?.[rule];
        const repl = { attribute: attributeName(attr), ...replace };
        if (custom) return trans(custom, repl);
        const key = typeKey ? `validation.${rule}.${typeKey}` : `validation.${rule}`;
        return trans(key, repl);
    };

    const add = (attr: string, msg: string) => {
        (errors[attr] ??= []).push(msg);
    };

    for (const [pattern, ruleSet] of Object.entries(rules)) {
        const list: Rule[] = Array.isArray(ruleSet) ? ruleSet : typeof ruleSet === 'string' ? ruleSet.split('|') : [ruleSet];

        for (const attr of expand(pattern, data)) {
            const value = getPath(data, attr);
            const parsed = list.map((r) => (typeof r === 'string' ? { fn: null as RuleFn | null, ...parseRule(r) } : { fn: r, name: 'closure', params: [] as string[] }));
            const names = parsed.map((p) => p.name);
            const nullable = names.includes('nullable');
            const sometimes = names.includes('sometimes');
            const hasNumeric = names.includes('numeric') || names.includes('integer') || names.includes('int');
            const present = getPath(data, attr) !== undefined;

            if (sometimes && !present) continue;

            const blank = isBlank(value);
            let stop = false;
            const failedHere: string[] = [];
            const startCount = (errors[attr] ?? []).length;

            for (const { fn, name, params } of parsed) {
                if (stop) break;
                if (name === 'nullable' || name === 'sometimes' || name === 'bail') continue;

                const fail = (msg: string) => add(attr, msg);

                // implicit rules run even when empty
                const implicit = ['required', 'filled', 'present', 'accepted', 'required_if', 'required_unless', 'required_with', 'required_with_all', 'required_without', 'required_without_all', 'prohibited'];

                if (value === null && nullable) {
                    stop = true;
                    break;
                }
                if (blank && !implicit.includes(name) && name !== 'closure') {
                    // non-implicit rules are skipped on empty values
                    continue;
                }

                if (fn) {
                    await fn(value, fail, { data, attribute: attr });
                    continue;
                }

                const before = (errors[attr] ?? []).length;
                switch (name) {
                    case 'required':
                        if (blank) fail(message(attr, 'required'));
                        break;
                    case 'filled':
                        if (present && blank) fail(message(attr, 'filled'));
                        break;
                    case 'present':
                        if (!present) fail(message(attr, 'present'));
                        break;
                    case 'accepted':
                        if (!['yes', 'on', '1', 1, true, 'true'].includes(value)) fail(message(attr, 'accepted'));
                        break;
                    case 'declined':
                        if (!['no', 'off', '0', 0, false, 'false'].includes(value)) fail(message(attr, 'declined'));
                        break;
                    case 'prohibited':
                        if (!blank) fail(message(attr, 'prohibited'));
                        break;
                    case 'required_if': {
                        const [other, ...vals] = params;
                        const o = getPath(data, other);
                        if (vals.map(String).includes(String(o)) && blank) fail(message(attr, 'required_if', { other: attributeName(other), value: String(o) }));
                        break;
                    }
                    case 'required_unless': {
                        const [other, ...vals] = params;
                        const o = getPath(data, other);
                        if (!vals.map(String).includes(String(o)) && blank) fail(message(attr, 'required_unless', { other: attributeName(other), values: vals.join(', ') }));
                        break;
                    }
                    case 'required_with':
                        if (params.some((p) => !isBlank(getPath(data, p))) && blank) fail(message(attr, 'required_with', { values: params.map(attributeName).join(' / ') }));
                        break;
                    case 'required_without':
                        if (params.some((p) => isBlank(getPath(data, p))) && blank) fail(message(attr, 'required_without', { values: params.map(attributeName).join(' / ') }));
                        break;
                    case 'string':
                        if (typeof value !== 'string') fail(message(attr, 'string'));
                        break;
                    case 'numeric':
                        if (!isNumeric(value)) fail(message(attr, 'numeric'));
                        break;
                    case 'integer':
                    case 'int':
                        if (!isIntLike(value)) fail(message(attr, 'integer'));
                        break;
                    case 'boolean':
                        if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(value)) fail(message(attr, 'boolean'));
                        break;
                    case 'array':
                        if (!Array.isArray(value) && !(value && typeof value === 'object' && !isFile(value))) fail(message(attr, 'array'));
                        break;
                    case 'email':
                        if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) fail(message(attr, 'email'));
                        break;
                    case 'url':
                        try {
                            if (typeof value !== 'string') throw new Error();
                            const u = new URL(value);
                            if (!u.protocol || !u.host) throw new Error();
                        } catch {
                            fail(message(attr, 'url'));
                        }
                        break;
                    case 'active_url':
                        try {
                            new URL(String(value));
                        } catch {
                            fail(message(attr, 'active_url'));
                        }
                        break;
                    case 'ip':
                    case 'ipv4':
                    case 'ipv6': {
                        const s = String(value);
                        const v4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
                        const v6 = /^[0-9a-fA-F:.]+$/.test(s) && s.includes(':') && s.split(':').length <= 8;
                        if (name === 'ip' ? !(v4 || v6) : name === 'ipv4' ? !v4 : !v6) fail(message(attr, name));
                        break;
                    }
                    case 'json':
                        try {
                            JSON.parse(String(value));
                        } catch {
                            fail(message(attr, 'json'));
                        }
                        break;
                    case 'uuid':
                        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) fail(message(attr, 'uuid'));
                        break;
                    case 'ulid':
                        if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(String(value))) fail(message(attr, 'ulid'));
                        break;
                    case 'alpha':
                        if (!/^\p{L}+$/u.test(String(value))) fail(message(attr, 'alpha'));
                        break;
                    case 'alpha_num':
                        if (!/^[\p{L}\p{N}]+$/u.test(String(value))) fail(message(attr, 'alpha_num'));
                        break;
                    case 'alpha_dash':
                        if (!/^[\p{L}\p{N}_-]+$/u.test(String(value))) fail(message(attr, 'alpha_dash'));
                        break;
                    case 'lowercase':
                        if (String(value) !== String(value).toLowerCase()) fail(message(attr, 'lowercase'));
                        break;
                    case 'uppercase':
                        if (String(value) !== String(value).toUpperCase()) fail(message(attr, 'uppercase'));
                        break;
                    case 'hex_color':
                        if (!/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(value))) fail(message(attr, 'hex_color'));
                        break;
                    case 'timezone':
                        try {
                            new Intl.DateTimeFormat('en', { timeZone: String(value) });
                        } catch {
                            fail(message(attr, 'timezone'));
                        }
                        break;
                    case 'regex': {
                        const m = /^\/(.*)\/([a-z]*)$/s.exec(params[0]);
                        const re = m ? new RegExp(m[1], m[2]) : new RegExp(params[0]);
                        if (!re.test(String(value))) fail(message(attr, 'regex'));
                        break;
                    }
                    case 'not_regex': {
                        const m = /^\/(.*)\/([a-z]*)$/s.exec(params[0]);
                        const re = m ? new RegExp(m[1], m[2]) : new RegExp(params[0]);
                        if (re.test(String(value))) fail(message(attr, 'not_regex'));
                        break;
                    }
                    case 'starts_with':
                        if (!params.some((p) => String(value).startsWith(p))) fail(message(attr, 'starts_with', { values: params.join(', ') }));
                        break;
                    case 'ends_with':
                        if (!params.some((p) => String(value).endsWith(p))) fail(message(attr, 'ends_with', { values: params.join(', ') }));
                        break;
                    case 'in':
                        if (Array.isArray(value) ? !value.every((v) => params.includes(String(v))) : !params.includes(String(value))) fail(message(attr, 'in'));
                        break;
                    case 'not_in':
                        if (params.includes(String(value))) fail(message(attr, 'not_in'));
                        break;
                    case 'confirmed': {
                        const other = getPath(data, `${attr}_confirmation`);
                        if (String(other ?? '') !== String(value ?? '')) fail(message(attr, 'confirmed'));
                        break;
                    }
                    case 'same': {
                        const other = getPath(data, params[0]);
                        if (String(other ?? '') !== String(value ?? '')) fail(message(attr, 'same', { other: attributeName(params[0]) }));
                        break;
                    }
                    case 'different': {
                        const other = getPath(data, params[0]);
                        if (String(other ?? '') === String(value ?? '')) fail(message(attr, 'different', { other: attributeName(params[0]) }));
                        break;
                    }
                    case 'min':
                    case 'max':
                    case 'size': {
                        const { size, type } = sizeOf(value, hasNumeric);
                        const limit = Number(params[0]);
                        const bad = name === 'min' ? size < limit : name === 'max' ? size > limit : size !== limit;
                        if (bad) fail(message(attr, name, { [name]: params[0] }, type));
                        break;
                    }
                    case 'between': {
                        const { size, type } = sizeOf(value, hasNumeric);
                        if (size < Number(params[0]) || size > Number(params[1])) fail(message(attr, 'between', { min: params[0], max: params[1] }, type));
                        break;
                    }
                    case 'gt':
                    case 'gte':
                    case 'lt':
                    case 'lte': {
                        const { size, type } = sizeOf(value, hasNumeric);
                        const other = getPath(data, params[0]);
                        const compare = other !== undefined ? sizeOf(other, hasNumeric).size : Number(params[0]);
                        const ok = name === 'gt' ? size > compare : name === 'gte' ? size >= compare : name === 'lt' ? size < compare : size <= compare;
                        if (!ok) fail(message(attr, name, { value: other !== undefined ? attributeName(params[0]) : params[0] }, type));
                        break;
                    }
                    case 'digits':
                        if (!/^\d+$/.test(String(value)) || String(value).length !== Number(params[0])) fail(message(attr, 'digits', { digits: params[0] }));
                        break;
                    case 'digits_between':
                        if (!/^\d+$/.test(String(value)) || String(value).length < Number(params[0]) || String(value).length > Number(params[1])) fail(message(attr, 'digits_between', { min: params[0], max: params[1] }));
                        break;
                    case 'date':
                        if (!isDateValid(value)) fail(message(attr, 'date'));
                        break;
                    case 'after':
                    case 'after_or_equal':
                    case 'before':
                    case 'before_or_equal': {
                        const other = getPath(data, params[0]) ?? params[0];
                        const a = new Date(value).getTime();
                        const b = new Date(other).getTime();
                        const ok = name === 'after' ? a > b : name === 'after_or_equal' ? a >= b : name === 'before' ? a < b : a <= b;
                        if (!ok) fail(message(attr, name, { date: String(other) }));
                        break;
                    }
                    case 'file':
                        if (!isFile(value)) fail(message(attr, 'file'));
                        break;
                    case 'image':
                        if (!isFile(value) || !IMAGE_MIMES.includes(value.type)) fail(message(attr, 'image'));
                        break;
                    case 'mimes':
                    case 'extensions': {
                        const ext = isFile(value) ? value.name.split('.').pop()?.toLowerCase() ?? '' : '';
                        if (!isFile(value) || !params.map((p) => p.toLowerCase()).includes(ext)) fail(message(attr, name, { values: params.join(', ') }));
                        break;
                    }
                    case 'mimetypes':
                        if (!isFile(value) || !params.includes(value.type)) fail(message(attr, 'mimetypes', { values: params.join(', ') }));
                        break;
                    case 'current_password':
                        if (!options.checkCurrentPassword || !(await options.checkCurrentPassword(String(value)))) fail(message(attr, 'current_password'));
                        break;
                    case 'password': {
                        // Password::min(n)->letters()->numbers()... encoded as `password:min=8,letters,numbers`
                        const opts = Object.fromEntries(params.map((p) => p.split('=') as [string, string | undefined]));
                        const s = String(value);
                        const min = Number(opts.min ?? 8);
                        if ([...s].length < min) fail(message(attr, 'password.min', { min }));
                        if ('letters' in opts && !/\p{L}/u.test(s)) fail(message(attr, 'password.letters'));
                        if ('mixed' in opts && !(/\p{Lu}/u.test(s) && /\p{Ll}/u.test(s))) fail(message(attr, 'password.mixed'));
                        if ('numbers' in opts && !/\p{N}/u.test(s)) fail(message(attr, 'password.numbers'));
                        if ('symbols' in opts && !/[\p{P}\p{S}]/u.test(s)) fail(message(attr, 'password.symbols'));
                        break;
                    }
                    case 'exists': {
                        const [table, column = attr.split('.').pop()!] = params;
                        const values = Array.isArray(value) ? value : [value];
                        const found = await query.count(table, column, values);
                        if (found < new Set(values.map(String)).size) fail(message(attr, 'exists'));
                        break;
                    }
                    case 'unique': {
                        // unique:table,column,ignoreValue,idColumn,extraColumn,extraValue
                        const [table, columnRaw, ignore, idColumn = 'id', ...extra] = params;
                        const column = !columnRaw || columnRaw === 'NULL' ? attr.split('.').pop()! : columnRaw;
                        const where: Array<[string, unknown]> = [];
                        for (let i = 0; i + 1 < extra.length; i += 2) where.push([extra[i], extra[i + 1]]);
                        const taken = await query.exists(table, column, value, ignore && ignore !== 'NULL' ? { column: idColumn, value: ignore } : undefined, where);
                        if (taken) fail(message(attr, 'unique'));
                        break;
                    }
                    default:
                        // unknown rules (e.g. `bail`, `max_digits`) never fail
                        break;
                }
                if ((errors[attr] ?? []).length > before) failedHere.push(name);
            }

            if ((errors[attr] ?? []).length === startCount && present) {
                // set into validated data
                const keys = attr.split('.');
                let cur = validated;
                keys.forEach((k, i) => {
                    if (i === keys.length - 1) cur[k] = value;
                    else cur = cur[k] ??= /^\d+$/.test(keys[i + 1]) ? [] : {};
                });
            }
        }
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);
    return validated as T;
}

/** Adds `password:min=8,letters,numbers`-style rule for `Password::min(8)->letters()->numbers()`. */
export const passwordRule = (opts: { min?: number; letters?: boolean; mixed?: boolean; numbers?: boolean; symbols?: boolean } = {}) =>
    `password:min=${opts.min ?? 8}${opts.letters ? ',letters' : ''}${opts.mixed ? ',mixed' : ''}${opts.numbers ? ',numbers' : ''}${opts.symbols ? ',symbols' : ''}`;
