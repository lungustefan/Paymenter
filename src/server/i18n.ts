import fs from 'node:fs';
import path from 'node:path';
import { config, setting } from './config';
import { dataGet } from './lib/php';

/**
 * Translations. Mirrors Laravel's translator on top of the JSON files that
 * replaced the original PHP lang arrays (same file names, same keys).
 */

type Tree = Record<string, any>;

const cache = new Map<string, Record<string, Tree>>();
const namespaces = new Map<string, string>(); // namespace -> directory containing <locale>/<file>.json

export function langPath(): string {
    return path.join(process.cwd(), 'lang');
}

/** Register extension translations: `affiliates::affiliate.key` */
export function registerLangNamespace(namespace: string, dir: string) {
    namespaces.set(namespace, dir);
    for (const k of [...cache.keys()]) if (k.startsWith(`${namespace}::`)) cache.delete(k);
}

export function flushTranslations() {
    cache.clear();
}

function loadGroup(namespaceDir: string, cacheKey: string, locale: string): Record<string, Tree> {
    const key = `${cacheKey}|${locale}`;
    let groups = cache.get(key);
    if (groups) return groups;
    groups = {};
    const dir = path.join(namespaceDir, locale);
    try {
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.json')) continue;
            try {
                groups[file.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            } catch {
                /* ignore broken file */
            }
        }
    } catch {
        /* locale does not exist */
    }
    cache.set(key, groups);
    return groups;
}

/** Flat `lang/<locale>.json` file used for literal-string keys (`__('Some text.')`). */
function loadJsonFile(locale: string): Tree {
    const key = `__json__|${locale}`;
    let t = cache.get(key) as unknown as Tree | undefined;
    if (t) return t;
    try {
        t = JSON.parse(fs.readFileSync(path.join(langPath(), `${locale}.json`), 'utf8'));
    } catch {
        t = {};
    }
    cache.set(key, t as any);
    return t!;
}

export function availableLanguages(): string[] {
    try {
        const dirs = fs
            .readdirSync(langPath(), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
        return dirs.length ? dirs : ['en'];
    } catch {
        return ['en'];
    }
}

function lookup(key: string, locale: string): string | Tree | undefined {
    let dir = langPath();
    let cacheKey = 'core';
    let k = key;
    const ns = /^([a-z0-9_-]+)::(.+)$/i.exec(key);
    if (ns) {
        const nsDir = namespaces.get(ns[1]);
        if (!nsDir) return undefined;
        dir = nsDir;
        cacheKey = ns[1];
        k = ns[2];
    }
    const [group, ...rest] = k.split('.');
    const tree = loadGroup(dir, `${cacheKey}:${dir}`, locale)[group];
    if (tree === undefined) {
        // literal key in lang/<locale>.json
        return loadJsonFile(locale)[key];
    }
    if (rest.length === 0) return tree;
    return dataGet(tree, rest.join('.'), undefined);
}

function applyReplacements(line: string, replace: Record<string, unknown>): string {
    if (!replace) return line;
    const keys = Object.keys(replace).sort((a, b) => b.length - a.length);
    for (const k of keys) {
        const v = String(replace[k] ?? '');
        line = line
            .replaceAll(`:${k.toUpperCase()}`, v.toUpperCase())
            .replaceAll(`:${k.charAt(0).toUpperCase()}${k.slice(1)}`, v.charAt(0).toUpperCase() + v.slice(1))
            .replaceAll(`:${k}`, v);
    }
    return line;
}

export function defaultLocale(): string {
    return config('app.locale', 'en');
}

/** `__()`; falls back to the fallback locale, then to the key itself. */
export function t(key: string, replace: Record<string, unknown> = {}, locale: string = defaultLocale()): string {
    const fallback = config<string>('app.fallback_locale', 'en');
    let line = lookup(key, locale);
    if (typeof line !== 'string' && locale !== fallback) line = lookup(key, fallback);
    if (typeof line !== 'string') return applyReplacements(key, replace);
    return applyReplacements(line, replace);
}

export function hasTranslation(key: string, locale: string = defaultLocale()): boolean {
    return typeof lookup(key, locale) === 'string';
}

/** Laravel's `MessageSelector::choose()`. */
export function choose(line: string, number: number, locale: string): string {
    const segments = line.split('|');
    // explicit intervals: {0} none | [1,19] some | [20,*] many
    for (const s of segments) {
        const m = /^[\{\[]([^\[\]\{\}]*)[\}\]]\s*([\s\S]*)$/.exec(s.trim());
        if (!m) continue;
        const [, cond, text] = m;
        if (!cond.includes(',')) {
            if (Number(cond) === number) return text;
            continue;
        }
        const [from, to] = cond.split(',');
        if (Number(from) <= number && (to.trim() === '*' || number <= Number(to))) return text;
    }
    const stripped = segments.map((s) => s.replace(/^[\{\[][^\[\]\{\}]*[\}\]]\s*/, ''));
    if (stripped.length === 1) return stripped[0];
    const category = new Intl.PluralRules(locale).select(number);
    const order: Record<string, number> = { one: 0, other: 1 };
    const idx = stripped.length === 2 ? (order[category] ?? 1) : Math.min(({ zero: 0, one: 0, two: 1, few: 1, many: 2, other: stripped.length - 1 } as any)[category] ?? 0, stripped.length - 1);
    return stripped[idx] ?? stripped[0];
}

export function tChoice(key: string, count: number | unknown[], replace: Record<string, unknown> = {}, locale: string = defaultLocale()): string {
    const number = Array.isArray(count) ? count.length : count;
    const fallback = config<string>('app.fallback_locale', 'en');
    let line = lookup(key, locale);
    if (typeof line !== 'string' && locale !== fallback) line = lookup(key, fallback);
    const text = choose(typeof line === 'string' ? line : key, Number(number), locale);
    return applyReplacements(text, { count: number, ...replace });
}

export interface Translator {
    locale: string;
    t: (key: string, replace?: Record<string, unknown>) => string;
    tChoice: (key: string, count: number | unknown[], replace?: Record<string, unknown>) => string;
    isRtl: boolean;
}

export function makeTranslator(locale: string): Translator {
    return {
        locale,
        t: (key, replace = {}) => t(key, replace, locale),
        tChoice: (key, count, replace = {}) => tChoice(key, count, replace, locale),
        isRtl: ['ar'].includes(locale),
    };
}

/** Languages the admin allowed in settings (falls back to everything available). */
export function allowedLanguages(): string[] {
    const allowed = setting<string[]>('allowed_languages', []);
    return Array.isArray(allowed) && allowed.length ? allowed : availableLanguages();
}

function deepMerge(a: Tree, b: Tree): Tree {
    const out: Tree = { ...a };
    for (const [k, v] of Object.entries(b)) {
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] ? deepMerge(out[k], v) : v;
    }
    return out;
}

/** Every language group of `locale` (over the fallback locale) - handed to client components. */
export function clientMessages(locale: string): Tree {
    const fallback = config<string>('app.fallback_locale', 'en');
    const groups = (loc: string) => loadGroup(langPath(), `core:${langPath()}`, loc);
    const merged = locale === fallback ? groups(locale) : deepMerge(groups(fallback), groups(locale));
    return { ...merged, __json: { ...loadJsonFile(fallback), ...loadJsonFile(locale) } };
}
