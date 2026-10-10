/**
 * Small helpers that reproduce PHP built-ins where JS semantics differ.
 * Billing code depends on these behaving exactly like the original.
 */

/** PHP `round()`: half away from zero, with PHP's pre-rounding to guard against float noise. */
export function round(value: number, precision = 0): number {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** precision;
    // Pre-round to 15 significant digits like PHP does to avoid 1.005 -> 1.00
    const scaled = Number((value * factor).toPrecision(15));
    const rounded = scaled >= 0 ? Math.floor(scaled + 0.5) : Math.ceil(scaled - 0.5);
    return rounded / factor;
}

/** PHP `number_format()`; returns a string. */
export function numberFormat(
    value: number | string | null | undefined,
    decimals = 0,
    decimalSeparator = '.',
    thousandsSeparator = ',',
): string {
    const num = Number(value ?? 0);
    const abs = round(Math.abs(num), decimals);
    let [int, frac = ''] = abs.toFixed(Math.max(0, decimals)).split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    frac = frac.padEnd(decimals, '0');
    const sign = num < 0 && abs !== 0 ? '-' : '';
    return sign + int + (decimals > 0 ? decimalSeparator + frac : '');
}

export function strPad(value: string | number, length: number, pad = ' ', type: 'left' | 'right' | 'both' = 'right'): string {
    const s = String(value);
    if (s.length >= length) return s;
    if (type === 'left') return s.padStart(length, pad);
    if (type === 'both') {
        const total = length - s.length;
        const left = Math.floor(total / 2);
        return pad.repeat(left).slice(0, left) + s + pad.repeat(total - left).slice(0, total - left);
    }
    return s.padEnd(length, pad);
}

export function ucfirst(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function lcfirst(s: string): string {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function nl2br(s: string): string {
    return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

/** Laravel `e()` / `htmlspecialchars` with double-encode. */
export function e(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** PHP truthiness. */
export function truthy(v: unknown): boolean {
    if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'number' && Number.isNaN(v)) return false;
    return true;
}

/** PHP `empty()`. */
export function empty(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === 'object' && !Array.isArray(v)) return Object.keys(v as object).length === 0 && !(v instanceof Date);
    return !truthy(v);
}

export function isNumeric(v: unknown): boolean {
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v !== 'string' || v.trim() === '') return false;
    return /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v);
}

/** Laravel `Str::slug`. */
export function slug(title: string, separator = '-'): string {
    const ascii = title
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\x00-\x7F]/g, '');
    return ascii
        .toLowerCase()
        .replace(/@/g, `${separator}at${separator}`)
        .replace(/[^a-z0-9]+/g, separator)
        .replace(new RegExp(`${separator}{2,}`, 'g'), separator)
        .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');
}

/** Laravel `Arr::dot`. */
export function arrDot(obj: Record<string, any>, prepend = ''): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
            Object.assign(out, arrDot(v, `${prepend}${k}.`));
        } else {
            out[`${prepend}${k}`] = v;
        }
    }
    return out;
}

/** Laravel `data_get` / `Arr::get` with dot notation. */
export function dataGet(target: any, path: string | string[] | null, fallback: any = null): any {
    if (path === null || path === undefined) return target;
    const keys = Array.isArray(path) ? path : String(path).split('.');
    let cur = target;
    for (const key of keys) {
        if (cur === null || cur === undefined) return fallback;
        cur = cur[key as any];
    }
    return cur === undefined ? fallback : cur;
}

/** Laravel `Arr::set` (returns a mutated copy). */
export function dataSet(target: Record<string, any>, path: string, value: any): Record<string, any> {
    const keys = path.split('.');
    let cur = target;
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
        cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
    return target;
}

export function arrExcept<T extends Record<string, any>>(obj: T, keys: string[]): Partial<T> {
    const out: Record<string, any> = { ...obj };
    for (const k of keys) delete out[k];
    return out as Partial<T>;
}

export function sum<T>(items: T[], fn: (item: T) => number): number {
    return items.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function groupBy<T, K extends string | number>(items: T[], fn: (item: T) => K): Record<K, T[]> {
    const out = {} as Record<K, T[]>;
    for (const item of items) (out[fn(item)] ??= []).push(item);
    return out;
}

export function uniqueBy<T>(items: T[], fn: (item: T) => unknown): T[] {
    const seen = new Set<unknown>();
    return items.filter((i) => {
        const k = fn(i);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/** What a DECIMAL(x, scale) column reads as in PHP (`"21.00"`): decimal columns are plain numbers in the ORM. */
export function decimalString(value: unknown, scale = 2): string {
    return value === null || value === undefined || value === '' ? '' : Number(value).toFixed(scale);
}

const urldecode = (s: string): string => {
    const plus = s.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(plus);
    } catch {
        return plus.replace(/%([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    }
};

/** PHP `parse_str()`: `a=1&b[]=2&c[d]=3` -> nested objects / arrays (`[]` and numeric keys make arrays). */
export function parseStr(input: string): Record<string, any> {
    const out: Record<string, any> = {};
    for (const pair of input.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const key = urldecode(eq === -1 ? pair : pair.slice(0, eq)).replace(/^ +/, '');
        const value = eq === -1 ? '' : urldecode(pair.slice(eq + 1));
        const bracket = key.indexOf('[');
        const base = (bracket === -1 ? key : key.slice(0, bracket)).replace(/[ .]/g, '_');
        if (!base) continue;
        const indices = bracket === -1 ? [] : [...key.slice(bracket).matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
        if (indices.length === 0) {
            out[base] = value;
            continue;
        }
        let container: any = out;
        let name: string | number = base;
        for (const index of indices) {
            if (container[name] === undefined || typeof container[name] !== 'object') {
                container[name] = index === '' || /^\d+$/.test(index) ? [] : {};
            }
            container = container[name];
            name = index === '' ? (Array.isArray(container) ? container.length : Object.keys(container).length) : index;
        }
        container[name] = value;
    }
    return out;
}

/** PHP `html_entity_decode()` for the entities that appear in API responses. */
export function htmlEntityDecode(s: string): string {
    return s
        .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

/** PHP `str_shuffle()` */
export function strShuffle(s: string): string {
    const chars = [...s];
    for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/** PHP `filter_var($value, FILTER_VALIDATE_DOMAIN)` (without FILTER_FLAG_HOSTNAME: only the length rules apply). */
export function filterValidateDomain(value: string): boolean {
    let domain = value;
    if (domain.length > 0 && domain.endsWith('.')) domain = domain.slice(0, -1);
    // The total length cannot exceed 253 characters (final dot not included)
    if (domain.length > 253 || domain.length === 0 || domain.startsWith('.')) return false;
    let label = 1;
    for (let i = 0; i < domain.length; i++) {
        if (domain[i] === '.') {
            if (domain[i + 1] === '.') return false;
            label = 1;
        } else {
            if (label > 63) return false;
            label++;
        }
    }
    return true;
}

const TRANSLITERATE: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', œ: 'oe', Œ: 'OE', þ: 'th', Þ: 'TH', ð: 'd', Ð: 'D', ı: 'i' };

/** Laravel `Str::transliterate()` (unknown characters become `?`). */
export function transliterate(s: string, unknown = '?'): string {
    return [...s]
        .map((ch) => {
            if (ch.charCodeAt(0) < 128) return ch;
            if (TRANSLITERATE[ch]) return TRANSLITERATE[ch];
            const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
            return /^[\x00-\x7F]+$/.test(base) && base !== '' ? base : unknown;
        })
        .join('');
}
