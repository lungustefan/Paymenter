import { Model } from '@/server/orm';
import { Carbon } from '@/server/lib/carbon';
import { empty as phpEmpty, isNumeric, truthy } from '@/server/lib/php';
import type { Node } from './php-expr';

export interface EvalContext {
    vars: Record<string, any>;
    /** global helper functions: route(), config(), __() ... (case-insensitive lookup) */
    functions: Record<string, (...args: any[]) => any>;
    /** static classes: Str, Arr, Storage, BladeCompiler ... keyed by short or full name */
    statics: Record<string, Record<string, any>>;
    /** `Foo::class` resolution and enum constants */
    classes: Record<string, any>;
}

const UNDEF = Symbol('undef');

function shortName(name: string): string {
    const parts = name.replace(/^\\/, '').split('\\');
    return parts[parts.length - 1];
}

export function toStr(v: any): string {
    if (v === null || v === undefined || v === false) return '';
    if (v === true) return '1';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'string') return v;
    if (v instanceof Carbon) return v.toString();
    if (Array.isArray(v)) return 'Array';
    if (typeof v.toHtml === 'function') return v.toHtml();
    if (typeof v.toString === 'function' && v.toString !== Object.prototype.toString) return v.toString();
    return '';
}

export function toNum(v: any): number {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined || v === false || v === '') return 0;
    if (v === true) return 1;
    if (typeof v === 'string') {
        const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(v);
        return m ? Number(m[0]) : 0;
    }
    return Number(v) || 0;
}

/** PHP loose equality (==). */
export function looseEq(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined || b === '' || b === false || b === 0 || (Array.isArray(b) && b.length === 0);
    if (b === null || b === undefined) return looseEq(b, a);
    if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
    if (typeof a === 'number' && typeof b === 'string') return isNumeric(b) ? a === Number(b) : String(a) === b;
    if (typeof a === 'string' && typeof b === 'number') return looseEq(b, a);
    if (typeof a === 'string' && typeof b === 'string') {
        if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
        return a === b;
    }
    if (a instanceof Carbon && b instanceof Carbon) return a.valueOf() === b.valueOf();
    if (a instanceof Model && b instanceof Model) return a.is(b);
    return false;
}

function compare(a: any, b: any): number {
    if (typeof a === 'string' && typeof b === 'string' && !(isNumeric(a) && isNumeric(b))) return a < b ? -1 : a > b ? 1 : 0;
    if (a instanceof Carbon) a = a.valueOf();
    if (b instanceof Carbon) b = b.valueOf();
    const x = toNum(a);
    const y = toNum(b);
    return x < y ? -1 : x > y ? 1 : 0;
}

/** Array-like "collection" helpers for method calls on arrays (`$items->count()`). */
const collectionMethods: Record<string, (arr: any[], ...args: any[]) => any> = {
    count: (a) => a.length,
    first: (a) => a[0] ?? null,
    last: (a) => a[a.length - 1] ?? null,
    isEmpty: (a) => a.length === 0,
    isNotEmpty: (a) => a.length > 0,
    toArray: (a) => a,
    all: (a) => a,
    values: (a) => a,
    sum: (a, key?: string) => a.reduce((s, x) => s + toNum(key ? (x as any)?.[key] : x), 0),
    pluck: (a, key: string) => a.map((x) => x?.[key]),
    contains: (a, v) => a.some((x) => (x instanceof Model && v instanceof Model ? x.is(v) : looseEq(x, v) || (x as any)?.id === v)),
    implode: (a, sep: string) => a.map(toStr).join(sep),
    join: (a, sep: string) => a.map(toStr).join(sep),
};

export async function evaluate(node: Node, ctx: EvalContext): Promise<any> {
    switch (node.k) {
        case 'lit':
            return node.v;
        case 'interp': {
            let out = '';
            for (const p of node.parts) out += typeof p === 'string' ? p : toStr(await evaluate(p, ctx));
            return out;
        }
        case 'var': {
            if (node.name === 'this') return null;
            return node.name in ctx.vars ? ctx.vars[node.name] : null;
        }
        case 'array': {
            const hasKeys = node.items.some((i) => i.key);
            if (!hasKeys) {
                const out: any[] = [];
                for (const it of node.items) {
                    const v = await evaluate(it.value, ctx);
                    if (it.spread && Array.isArray(v)) out.push(...v);
                    else out.push(v);
                }
                return out;
            }
            const obj: Record<string, any> = {};
            let idx = 0;
            for (const it of node.items) {
                const v = await evaluate(it.value, ctx);
                if (it.spread && v && typeof v === 'object') Object.assign(obj, v);
                else if (it.key) obj[toStr(await evaluate(it.key, ctx))] = v;
                else obj[idx++] = v;
            }
            return obj;
        }
        case 'prop': {
            const obj = await evaluate(node.obj, ctx);
            if (obj === null || obj === undefined) return null;
            const name = typeof node.name === 'string' ? node.name : toStr(await evaluate(node.name, ctx));
            return getProperty(obj, name);
        }
        case 'index': {
            const obj = await evaluate(node.obj, ctx);
            if (obj === null || obj === undefined || node.index === null) return null;
            const key = await evaluate(node.index, ctx);
            if (typeof obj === 'string') return obj[Number(key)] ?? null;
            const v = (obj as any)[key];
            return v === undefined ? null : v;
        }
        case 'method': {
            const obj = await evaluate(node.obj, ctx);
            if (obj === null || obj === undefined) return null;
            const args = await Promise.all(node.args.map((a) => evaluate(a, ctx)));
            return callMethod(obj, node.name, args);
        }
        case 'call': {
            const fn = await evaluate(node.callee, ctx);
            const args = await Promise.all(node.args.map((a) => evaluate(a, ctx)));
            if (typeof fn !== 'function') throw new Error('Value is not callable');
            return fn(...args);
        }
        case 'fn': {
            const name = node.name.replace(/^\\/, '');
            const lower = name.toLowerCase();
            if (lower === 'get_defined_vars') return { __data: ctx.vars };
            const fn = ctx.functions[lower] ?? ctx.functions[shortName(lower)];
            if (!fn) throw new Error(`Call to undefined function ${name}()`);
            const args = await Promise.all(node.args.map((a) => evaluate(a, ctx)));
            return fn(...args);
        }
        case 'static': {
            if (node.name === 'class') return resolveClassName(node.cls, ctx);
            const cls = ctx.statics[node.cls.replace(/^\\/, '')] ?? ctx.statics[shortName(node.cls)];
            const clsCtor = ctx.classes[node.cls.replace(/^\\/, '')] ?? ctx.classes[shortName(node.cls)];
            if (node.args === null) {
                // class constant / enum case
                if (cls && node.name in cls) return cls[node.name];
                if (clsCtor && node.name in clsCtor) return clsCtor[node.name];
                throw new Error(`Undefined constant ${node.cls}::${node.name}`);
            }
            const args = await Promise.all(node.args.map((a) => evaluate(a, ctx)));
            if (cls && typeof cls[node.name] === 'function') return cls[node.name](...args);
            if (clsCtor && typeof clsCtor[node.name] === 'function') return clsCtor[node.name](...args);
            throw new Error(`Call to undefined method ${node.cls}::${node.name}()`);
        }
        case 'const': {
            const lower = node.name.toLowerCase();
            if (lower === 'php_eol') return '\n';
            if (lower === 'php_int_max') return Number.MAX_SAFE_INTEGER;
            if (node.name in ctx.classes) return ctx.classes[node.name];
            throw new Error(`Undefined constant "${node.name}"`);
        }
        case 'unary': {
            const v = await evaluate(node.arg, ctx);
            if (node.op === '!') return !truthy(v);
            return node.op === '-' ? -toNum(v) : toNum(v);
        }
        case 'bin':
            return evalBinary(node, ctx);
        case 'tern': {
            const c = await evaluate(node.cond, ctx);
            if (node.yes === null) return truthy(c) ? c : evaluate(node.no, ctx);
            return truthy(c) ? evaluate(node.yes, ctx) : evaluate(node.no, ctx);
        }
        case 'assign': {
            const value = await evaluate(node.value, ctx);
            if (node.target.k !== 'var') throw new Error('Only variable assignment is supported');
            const cur = ctx.vars[node.target.name];
            let next = value;
            switch (node.op) {
                case '+=': next = toNum(cur) + toNum(value); break;
                case '-=': next = toNum(cur) - toNum(value); break;
                case '*=': next = toNum(cur) * toNum(value); break;
                case '/=': next = toNum(cur) / toNum(value); break;
                case '.=': next = toStr(cur) + toStr(value); break;
                case '??=': next = cur ?? value; break;
            }
            ctx.vars[node.target.name] = next;
            return next;
        }
        case 'arrow': {
            return (...args: any[]) => {
                const inner: EvalContext = { ...ctx, vars: { ...ctx.vars } };
                node.params.forEach((p, i) => (inner.vars[p] = args[i]));
                return evaluate(node.body, inner);
            };
        }
        case 'cast': {
            const v = await evaluate(node.arg, ctx);
            switch (node.type) {
                case 'int': case 'integer': return Math.trunc(toNum(v));
                case 'float': case 'double': return toNum(v);
                case 'string': return toStr(v);
                case 'bool': case 'boolean': return truthy(v);
                case 'array': return Array.isArray(v) ? v : v === null ? [] : [v];
                default: return v;
            }
        }
        case 'isset': {
            for (const a of node.args) {
                try {
                    const v = await evaluate(a, ctx);
                    if (v === null || v === undefined) return false;
                } catch {
                    return false;
                }
            }
            return true;
        }
        case 'empty': {
            try {
                const v = await evaluate(node.arg, ctx);
                if (Array.isArray(v)) return v.length === 0;
                return phpEmpty(v);
            } catch {
                return true;
            }
        }
        case 'instanceof': {
            const v = await evaluate(node.l, ctx);
            const cls = ctx.classes[node.cls.replace(/^\\/, '')] ?? ctx.classes[shortName(node.cls)];
            return typeof cls === 'function' && v instanceof cls;
        }
        case 'new':
            throw new Error('`new` is not supported in templates');
    }
}

function resolveClassName(cls: string, ctx: EvalContext): string {
    const short = shortName(cls);
    const ctor = ctx.classes[cls.replace(/^\\/, '')] ?? ctx.classes[short];
    if (ctor?.morphName) return ctor.morphName;
    return cls.replace(/^\\/, '');
}

async function getProperty(obj: any, name: string): Promise<any> {
    if (obj instanceof Model) return obj.getAttribute(name);
    if (obj instanceof Carbon) {
        const v = (obj as any)[name];
        return v === undefined ? null : v;
    }
    if (typeof obj === 'object') {
        const v = obj[name];
        if (v === undefined) return null;
        return typeof v === 'function' ? null : v;
    }
    return null;
}

async function callMethod(obj: any, name: string, args: any[]): Promise<any> {
    if (Array.isArray(obj)) {
        const fn = collectionMethods[name];
        if (fn) return fn(obj, ...args);
        throw new Error(`Call to undefined method Collection::${name}()`);
    }
    if (obj instanceof Model) {
        if (typeof (obj as any)[name] === 'function') return (obj as any)[name](...args);
        return obj.getAttribute(name);
    }
    if (typeof obj[name] === 'function') return obj[name](...args);
    throw new Error(`Call to undefined method ${obj?.constructor?.name ?? 'object'}::${name}()`);
}

async function evalBinary(node: Extract<Node, { k: 'bin' }>, ctx: EvalContext): Promise<any> {
    const { op } = node;
    if (op === '&&') return truthy(await evaluate(node.l, ctx)) && truthy(await evaluate(node.r, ctx));
    if (op === '||') return truthy(await evaluate(node.l, ctx)) || truthy(await evaluate(node.r, ctx));
    if (op === '??') {
        let l: any = null;
        try {
            l = await evaluate(node.l, ctx);
        } catch {
            l = null;
        }
        return l === null || l === undefined ? evaluate(node.r, ctx) : l;
    }
    const l = await evaluate(node.l, ctx);
    const r = await evaluate(node.r, ctx);
    switch (op) {
        case '.': return toStr(l) + toStr(r);
        case '+':
            if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r.slice(l.length)];
            return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': return toNum(l) / toNum(r);
        case '%': return toNum(l) % toNum(r);
        case '**': return toNum(l) ** toNum(r);
        case '==': return looseEq(l, r);
        case '!=': case '<>': return !looseEq(l, r);
        case '===': return strictEq(l, r);
        case '!==': return !strictEq(l, r);
        case '<': return compare(l, r) < 0;
        case '<=': return compare(l, r) <= 0;
        case '>': return compare(l, r) > 0;
        case '>=': return compare(l, r) >= 0;
        case '<=>': return compare(l, r);
    }
    throw new Error(`Unsupported operator ${op}`);
}

function strictEq(a: any, b: any): boolean {
    if (a instanceof Model && b instanceof Model) return a === b;
    return a === b;
}

export { UNDEF };
