import { config, setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { arrExcept, dataGet, e, nl2br, numberFormat, slug, truthy, ucfirst } from '@/server/lib/php';
import { t, tChoice } from '@/server/i18n';
import { markdown } from '@/server/markdown';
import { route, storageUrl, url } from '@/server/routes';
import { InvoiceTransactionStatus } from '@/server/enums';
import { renderTemplate } from './render';
import { toStr, type EvalContext } from './evaluate';

/**
 * Stand-in for `Illuminate\View\Compilers\BladeCompiler::render($template, $data)`
 * as used for notification templates and the mail header / footer.
 */

type Fn = (...args: any[]) => any;

const functions: Record<string, Fn> = {
    route: (name: string, params?: unknown, absolute = true) => route(name, params ?? {}, absolute),
    url: (p?: string) => url(p ?? '/'),
    config: (key: string, fallback: unknown = null) => {
        if (key.startsWith('settings.')) return setting(key.slice(9), fallback);
        return config(key, fallback);
    },
    __: (key: string, replace: Record<string, unknown> = {}) => t(key, replace),
    trans: (key: string, replace: Record<string, unknown> = {}) => t(key, replace),
    trans_choice: (key: string, n: number, replace: Record<string, unknown> = {}) => tChoice(key, n, replace),
    e: (v: unknown) => e(toStr(v)),
    date: (fmt: string, ts?: number) => (ts ? Carbon.createFromTimestamp(ts) : Carbon.now()).format(fmt),
    now: () => Carbon.now(),
    today: () => Carbon.today(),
    number_format: (n: unknown, d = 0, dp = '.', ts = ',') => numberFormat(n as number, d, dp, ts),
    strtoupper: (s: unknown) => toStr(s).toUpperCase(),
    strtolower: (s: unknown) => toStr(s).toLowerCase(),
    ucfirst: (s: unknown) => ucfirst(toStr(s)),
    ucwords: (s: unknown) => toStr(s).replace(/\b\w/g, (c) => c.toUpperCase()),
    strlen: (s: unknown) => toStr(s).length,
    trim: (s: unknown) => toStr(s).trim(),
    count: (a: any) => (Array.isArray(a) ? a.length : a && typeof a === 'object' ? Object.keys(a).length : 0),
    implode: (sep: any, arr?: any) => (Array.isArray(sep) ? sep : (arr as any[])).map(toStr).join(Array.isArray(sep) ? '' : sep),
    explode: (sep: string, s: string) => toStr(s).split(sep),
    in_array: (needle: any, hay: any[]) => hay.some((x) => x == needle),
    str_replace: (search: any, replace: any, subject: string) => toStr(subject).split(toStr(search)).join(toStr(replace)),
    nl2br: (s: unknown) => nl2br(toStr(s)),
    htmlspecialchars: (s: unknown) => e(toStr(s)),
    json_encode: (v: unknown) => JSON.stringify(v),
    is_null: (v: unknown) => v === null || v === undefined,
    isset: (v: unknown) => v !== null && v !== undefined,
    empty: (v: unknown) => !truthy(v),
    abs: (v: unknown) => Math.abs(Number(v)),
    round: (v: unknown, p = 0) => Number(Number(v).toFixed(p)),
    floor: (v: unknown) => Math.floor(Number(v)),
    ceil: (v: unknown) => Math.ceil(Number(v)),
    max: (...a: any[]) => Math.max(...a.flat().map(Number)),
    min: (...a: any[]) => Math.min(...a.flat().map(Number)),
    asset: (p: string) => url(p),
    collect: (v: any) => (Array.isArray(v) ? v : v ? Object.values(v) : []),
    storage_url: storageUrl,
    str_pad: (s: any, n: number, pad = ' ', type = 1) => (type === 0 ? toStr(s).padStart(n, pad) : toStr(s).padEnd(n, pad)),
};

const statics: Record<string, Record<string, any>> = {
    Str: {
        markdown: (s: string, options?: any) => markdown(toStr(s), options ?? {}),
        slug: (s: string) => slug(toStr(s)),
        upper: (s: string) => toStr(s).toUpperCase(),
        lower: (s: string) => toStr(s).toLowerCase(),
        ucfirst: (s: string) => ucfirst(toStr(s)),
        limit: (s: string, limit = 100, end = '...') => (toStr(s).length > limit ? toStr(s).slice(0, limit) + end : toStr(s)),
        length: (s: string) => toStr(s).length,
        contains: (h: string, n: string) => toStr(h).includes(toStr(n)),
        startsWith: (h: string, n: string) => toStr(h).startsWith(toStr(n)),
        endsWith: (h: string, n: string) => toStr(h).endsWith(toStr(n)),
        title: (s: string) => toStr(s).replace(/\b\w/g, (c) => c.toUpperCase()),
    },
    Arr: {
        get: (a: any, k: string, d: any = null) => dataGet(a, k, d),
        except: (a: any, k: string[]) => arrExcept(a, k),
    },
    Storage: { url: (p: string) => storageUrl(p) },
    URL: { to: (p: string) => url(p), route: (n: string, p?: unknown) => route(n, p ?? {}) },
    Carbon: { now: () => Carbon.now(), parse: (v: string) => Carbon.parse(v), today: () => Carbon.today() },
    InvoiceTransactionStatus: InvoiceTransactionStatus as any,
};

// `Illuminate\View\Compilers\BladeCompiler::render($template, $data)` - recursive rendering
statics['BladeCompiler'] = {
    render: (template: string | null, data?: Record<string, any>) => renderBlade(template ?? '', data ?? {}),
};
statics['Illuminate\\View\\Compilers\\BladeCompiler'] = statics['BladeCompiler'];

const classes: Record<string, any> = {};

export function registerBladeClass(name: string, ctor: any) {
    classes[name] = ctor;
}

/** Make a model class available to templates (`Service::class`, `Service::STATUS_ACTIVE`). */
export function registerBladeStatic(name: string, obj: Record<string, any>) {
    statics[name] = { ...(statics[name] ?? {}), ...obj };
}

export async function renderBlade(template: string | null | undefined, data: Record<string, any> = {}): Promise<string> {
    if (!template) return '';
    const ctx: EvalContext = { vars: { ...data }, functions, statics, classes };
    return renderTemplate(template, ctx);
}
