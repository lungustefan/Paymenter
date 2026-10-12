import type { CSSProperties } from 'react';

/** `$columns` / `$span`: a number is the default breakpoint, an object is per breakpoint */
export type Breakpoints<T> = Record<string, T>;

const cssName = (breakpoint: string) => breakpoint.replace(/!/g, 'n').replace(/@/g, 'c');

/** ComponentAttributeBag::grid() - `{ className, style }` of a grid container. */
export function gridProps(columns: number | null | Breakpoints<number | null | undefined> = {}, direction: 'row' | 'col' = 'row'): { className: string; style: CSSProperties } {
    const given: Breakpoints<number> = {};
    const source = typeof columns === 'number' || columns === null ? { lg: columns ?? undefined } : columns;
    for (const [k, v] of Object.entries(source ?? {})) if (v) given[k] = v;
    if (given.default === undefined) given.default = 1;
    const classes = ['fi-grid'];
    if (direction === 'col') classes.push('fi-grid-direction-col');
    for (const bp of Object.keys(given)) {
        if (bp === 'default') {
            if (given[bp] > 1) classes.push('fi-grid-cols');
        } else classes.push(`${bp}:fi-grid-cols`);
    }
    const style: Record<string, string> = {};
    for (const [bp, n] of Object.entries(given)) style[`--cols-${cssName(bp)}`] = direction === 'row' ? `repeat(${n}, minmax(0, 1fr))` : String(n);
    return { className: classes.join(' '), style: style as CSSProperties };
}

type Span = number | string;

/** ComponentAttributeBag::gridColumn() */
export function gridColumnProps(span: Breakpoints<Span | null | undefined> | Span | null = {}, start: Breakpoints<number | null | undefined> | number | null = {}, order: Breakpoints<number | null | undefined> | number | null = {}, hidden = false): { className: string; style: CSSProperties } {
    const norm = <T,>(v: Breakpoints<T | null | undefined> | T | null): Breakpoints<T> => {
        const src = v !== null && typeof v === 'object' ? (v as Breakpoints<T | null | undefined>) : { lg: v as T };
        const out: Breakpoints<T> = {};
        for (const [k, val] of Object.entries(src)) if (val) out[k] = val as T;
        return out;
    };
    const s = norm<Span>(span);
    const st = norm<number>(start);
    const o = norm<number>(order);
    const classes = ['fi-grid-col'];
    if (hidden || s.default === 'hidden') classes.push('fi-hidden');
    for (const bp of Object.keys(s)) if (bp !== 'default') classes.push(`${bp}:fi-grid-col-span`);
    for (const bp of Object.keys(st)) classes.push(bp === 'default' ? 'fi-grid-col-start' : `${bp}:fi-grid-col-start`);
    for (const bp of Object.keys(o)) classes.push(bp === 'default' ? 'fi-grid-col-order' : `${bp}:fi-grid-col-order`);
    const style: Record<string, string> = {};
    for (const [bp, v] of Object.entries(s)) style[`--col-span-${cssName(bp)}`] = v === 'full' ? '1 / -1' : `span ${v} / span ${v}`;
    for (const [bp, v] of Object.entries(st)) style[`--col-start-${cssName(bp)}`] = String(v);
    for (const [bp, v] of Object.entries(o)) style[`--col-order-${cssName(bp)}`] = String(v);
    return { className: classes.join(' '), style: style as CSSProperties };
}

/** `HasColumns::getAllColumns()`: `columns(2)` is `lg: 2`, `columns(['default' => 1, 'md' => 2])` per breakpoint */
export function resolveColumns(columns: number | Breakpoints<number | null> | null | undefined): Breakpoints<number | null> {
    if (columns === null || columns === undefined) return { default: 1 };
    if (typeof columns === 'number') return { lg: columns };
    return { ...columns };
}

/** `CanSpanColumns::getColumnSpan()`: a number is the default breakpoint here (unlike `columns()`) */
export function resolveSpan(span: Span | Breakpoints<Span | null> | null | undefined): Breakpoints<Span | null> {
    if (span === null || span === undefined) return { default: 1 };
    if (typeof span === 'object') return { ...span };
    return { default: span };
}
