'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SelectionContext, useAdminActions } from '../actions/client';
import { useAdminNotify } from '../layout/client';
import { buildQuery } from './state';
import { cn } from '@themes/default/components/cn';

interface TableCtxValue {
    /** `?search=…` params of the table (prefixed when the page has several tables) */
    go: (updates: Record<string, any>) => void;
    pending: boolean;
    selected: Array<string | number>;
    isSelected: (key: string) => boolean;
    toggle: (key: string) => void;
    toggleMany: (keys: string[]) => void;
    clear: () => void;
    pageKeys: string[];
    allCount: number;
    selectAll: () => Promise<void>;
    canSelectAll: boolean;
    loading: boolean;
}

const Ctx = createContext<TableCtxValue | null>(null);
export const useTable = () => useContext(Ctx)!;

/**
 * `x-data="filamentTable(...)"`: the selection of the records and the URL state of one table.
 * `pageKeys` are the record keys on the current page; `allKeysUrlKey` identifies the table for "select all".
 */
export function TableRoot({ tableId, pageKeys, allCount, className, children }: { tableId: string; pageKeys: string[]; allCount: number; className: string; children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [pending, startTransition] = useTransition();
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const { dispatch } = useAdminActions();
    const search = params.toString();

    // the page changed (search, filters, another page): the selection is cleared like Filament does when filtering
    const lastKeys = useRef(pageKeys.join('|'));
    useEffect(() => {
        const now = pageKeys.join('|');
        if (now !== lastKeys.current) {
            lastKeys.current = now;
            setSelected((s) => s.filter((k) => pageKeys.includes(k) || s.length > pageKeys.length));
        }
    }, [pageKeys]);

    const go = useCallback(
        (updates: Record<string, any>) => {
            const query = buildQuery(search, updates);
            startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
        },
        [pathname, router, search],
    );

    const toggle = useCallback((key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key])), []);
    const toggleMany = useCallback((keys: string[]) => setSelected((s) => (keys.every((k) => s.includes(k)) ? s.filter((k) => !keys.includes(k)) : [...new Set([...s, ...keys])])), []);
    const clear = useCallback(() => setSelected([]), []);
    const selectAll = useCallback(async () => {
        setLoading(true);
        try {
            const result = await dispatch({ type: 'table', table: tableId, action: 'allKeys' });
            if (Array.isArray(result.data)) setSelected(result.data.map(String));
        } finally {
            setLoading(false);
        }
    }, [dispatch, tableId]);

    const value = useMemo<TableCtxValue>(
        () => ({ go, pending, selected, isSelected: (k) => selected.includes(k), toggle, toggleMany, clear, pageKeys, allCount, selectAll, canSelectAll: allCount > selected.length, loading }),
        [go, pending, selected, toggle, toggleMany, clear, pageKeys, allCount, selectAll, loading],
    );
    const selection = useMemo(() => ({ selected, clear }), [selected, clear]);

    return (
        <Ctx.Provider value={value}>
            <SelectionContext.Provider value={selection}>
                <div className={cn(className, pending && 'fi-loading')}>
                    {children}
                </div>
            </SelectionContext.Provider>
        </Ctx.Provider>
    );
}

/** a table row: gets `fi-selected` while its record is selected */
export function TableRow({ recordKey, className, children }: { recordKey: string | null; className: string; children: ReactNode }) {
    const t = useTable();
    return <tr className={cn(className, recordKey !== null && t.isSelected(recordKey) && 'fi-selected')}>{children}</tr>;
}

export function RecordCheckbox({ recordKey, label, group }: { recordKey: string; label: string; group?: string }) {
    const t = useTable();
    return <input aria-label={label} type="checkbox" value={recordKey} checked={t.isSelected(recordKey)} onChange={() => t.toggle(recordKey)} data-group={group ?? ''} className="fi-ta-record-checkbox fi-checkbox-input" />;
}

/** the checkbox of a group header row: (de)selects the records of the group */
export function GroupCheckbox({ keys, label }: { keys: string[]; label: string }) {
    const t = useTable();
    const ref = useRef<HTMLInputElement>(null);
    const all = keys.length > 0 && keys.every((k) => t.isSelected(k));
    const some = keys.some((k) => t.isSelected(k));
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = !all && some;
    }, [all, some]);
    return <input ref={ref} aria-label={label} data-group-selectable-record-keys={JSON.stringify(keys)} type="checkbox" checked={all} onChange={() => t.toggleMany(keys)} className="fi-checkbox-input fi-ta-group-checkbox" />;
}

export function PageCheckbox({ label }: { label: string }) {
    const t = useTable();
    const ref = useRef<HTMLInputElement>(null);
    const all = t.pageKeys.length > 0 && t.pageKeys.every((k) => t.isSelected(k));
    const some = t.pageKeys.some((k) => t.isSelected(k));
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = !all && some;
    }, [all, some]);
    return <input ref={ref} aria-label={label} type="checkbox" checked={all} onChange={() => t.toggleMany(t.pageKeys)} className="fi-ta-page-checkbox fi-checkbox-input" />;
}

/** `<div class="fi-ta-selection-indicator">` */
export function SelectionIndicator({ labels }: { labels: { one: string; other: string; selectAll: string; deselectAll: string } }) {
    const t = useTable();
    const count = new Intl.NumberFormat().format(t.selected.length);
    const text = (t.selected.length === 1 ? labels.one : labels.other).replace(':count', count);
    return (
        <div role="status" aria-live="polite" aria-atomic="true" className="fi-ta-selection-indicator" hidden={t.selected.length === 0} style={t.selected.length === 0 ? { display: 'none' } : undefined}>
            <div>
                <span>{text}</span>
            </div>
            <div>
                <div className="fi-ta-selection-indicator-actions-ctn">
                    {t.canSelectAll && (
                        <button type="button" onClick={() => void t.selectAll()} className="fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-300 fi-link fi-size-md">
                            <span className="fi-link-label">{labels.selectAll}</span>
                        </button>
                    )}
                    <button type="button" onClick={t.clear} className="fi-color fi-color-danger fi-text-color-600 dark:fi-text-color-300 fi-link fi-size-md">
                        <span className="fi-link-label">{labels.deselectAll}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

/** the header of the toolbar is hidden while there is nothing to show (no search, no filters, no selection) */
export function SelectionOnly({ children }: { children: ReactNode }) {
    const t = useTable();
    return t.selected.length > 0 ? <>{children}</> : null;
}

/** `<x-filament-tables::search-field>` input: debounced, writes `?search=` */
export function SearchInput({ param, initial, debounce, onBlur, placeholder, className, id }: { param: string; initial: string; debounce: number; onBlur: boolean; placeholder?: string; className: string; id?: string }) {
    const t = useTable();
    const [value, setValue] = useState(initial);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => setValue(initial), [initial]);
    const commit = (v: string) => {
        if (v === initial) return;
        t.go({ [param]: v || null, page: null });
        t.clear();
    };
    return (
        <input
            id={id}
            className={className}
            autoComplete="off"
            maxLength={1000}
            placeholder={placeholder}
            type="search"
            value={value}
            onChange={(e) => {
                setValue(e.target.value);
                if (onBlur) return;
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => commit(e.target.value), debounce);
            }}
            onBlur={() => onBlur && commit(value)}
            onKeyUp={(e) => {
                if (e.key === 'Enter') {
                    if (timer.current) clearTimeout(timer.current);
                    commit(value);
                }
            }}
        />
    );
}

/** `sortTable('column')`: asc -> desc -> unsorted */
export function SortButton({ column, active, direction, className, children }: { column: string; active: boolean; direction: 'asc' | 'desc' | null; className: string; children: ReactNode }) {
    const t = useTable();
    return (
        <button
            type="button"
            className={className}
            onClick={() => {
                const next = active ? (direction === 'asc' ? 'desc' : null) : 'asc';
                t.go({ sort: next ? `${column}:${next}` : null, page: null });
            }}
        >
            {children}
        </button>
    );
}

/** pagination buttons / items */
export function PageButton({ page, className, label, active, disabled, ariaLabel, children, rel }: { page: number; className: string; label?: string; active?: boolean; disabled?: boolean; ariaLabel?: string; children?: ReactNode; rel?: string }) {
    const t = useTable();
    return (
        <button type="button" rel={rel} aria-label={ariaLabel} aria-current={active ? 'page' : undefined} aria-hidden={disabled ? true : undefined} disabled={disabled} className={className} onClick={() => t.go({ page: page === 1 ? null : page })}>
            {children}
            {label !== undefined && <span className="fi-pagination-item-label">{label}</span>}
        </button>
    );
}

export function PerPageSelect({ value, options, labels }: { value: string; options: string[]; labels: Record<string, string> }) {
    const t = useTable();
    return (
        <select className="fi-select-input" value={value} onChange={(e) => t.go({ perPage: e.target.value, page: null })}>
            {options.map((o) => (
                <option key={o} value={o}>
                    {labels[o] ?? o}
                </option>
            ))}
        </select>
    );
}

/** `->copyable()` text */
export function CopyableText({ className, text, message, duration, children }: { className: string; text: string; message: string; duration: number; children: ReactNode }) {
    const notify = useAdminNotify();
    return (
        <span
            className={className}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void navigator.clipboard?.writeText(text);
                notify({ id: `copy-${Date.now()}`, title: message, status: 'success', duration });
            }}
        >
            {children}
        </span>
    );
}
