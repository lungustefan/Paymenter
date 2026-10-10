'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFormContext, useFieldValue } from './runtime';
import { cn } from '@themes/default/components/cn';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}
type Entry = SelectOption | { group: string; options: SelectOption[] };

const flatten = (entries: Entry[]): SelectOption[] => entries.flatMap((e) => ('group' in e ? e.options : [e]));

const Cross = ({ size }: { size: 'xs' | 'sm' }) =>
    size === 'sm' ? (
        <svg className="fi-icon fi-size-sm" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
    ) : (
        <svg className="fi-icon fi-size-xs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
        </svg>
    );

/** The searchable / multiple select of Filament (`fi-select-input`), driven by the form state. */
export function SearchableSelect({
    path,
    id,
    options,
    extraOptions,
    dynamic,
    searchable,
    multiple,
    clearable,
    placeholder,
    disabled,
    live,
    searchDebounce,
    searchPrompt,
    searchingMessage,
    noSearchResultsMessage,
    noOptionsMessage,
    maxItems,
    maxItemsMessage,
    optionsLimit,
    disabledValues,
    selectedLabel,
}: {
    path: string;
    id: string;
    options: Entry[];
    extraOptions: SelectOption[];
    dynamic: boolean;
    searchable: boolean;
    multiple: boolean;
    clearable: boolean;
    placeholder: string;
    disabled: boolean;
    live?: { onBlur?: boolean; debounce?: number } | false;
    searchDebounce: number;
    searchPrompt: string;
    searchingMessage: string;
    noSearchResultsMessage: string;
    noOptionsMessage: string;
    maxItems?: number;
    maxItemsMessage?: string;
    optionsLimit: number;
    disabledValues: string[];
    selectedLabel: string;
}) {
    const [value, setValue] = useFieldValue(path);
    const { options: fetchOptions } = useFormContext();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Entry[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(extraOptions.map((o) => [o.value, o.label])));
    const [active, setActive] = useState(0);
    const wrap = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [panelTop, setPanelTop] = useState<string | undefined>(undefined);
    const dropdownId = `fi-select-input-dropdown-${useId().replace(/:/g, '')}`;

    const selected: string[] = multiple ? (Array.isArray(value) ? value.map(String) : []) : value === null || value === undefined || value === '' ? [] : [String(value)];
    const base = useMemo(() => flatten(options), [options]);

    // remember every label we have seen (options, search results, fetched labels)
    useEffect(() => {
        setLabels((l) => ({ ...l, ...Object.fromEntries([...base, ...extraOptions, ...flatten(results ?? [])].map((o) => [o.value, o.label])) }));
    }, [base, extraOptions, results]);

    // labels of the selected values we do not know yet (dynamic options)
    useEffect(() => {
        const missing = selected.filter((v) => labels[v] === undefined);
        if (missing.length === 0) return;
        let cancelled = false;
        void fetchOptions(path, undefined, missing).then((found) => {
            if (!cancelled) setLabels((l) => ({ ...l, ...Object.fromEntries(found.map((o) => [String(o.value), o.label])) }));
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected.join('|')]);

    const visible: Entry[] = useMemo(() => {
        const source: Entry[] = results ?? options;
        if (!search || dynamic) return source;
        const needle = search.toLowerCase();
        return source
            .map((e) => ('group' in e ? { ...e, options: e.options.filter((o) => o.label.toLowerCase().includes(needle)) } : e))
            .filter((e) => ('group' in e ? e.options.length > 0 : e.label.toLowerCase().includes(needle)));
    }, [results, options, search, dynamic]);
    const flatVisible = useMemo(() => flatten(visible), [visible]);

    const runSearch = useCallback(
        (term: string) => {
            if (timer.current) clearTimeout(timer.current);
            if (!dynamic) return;
            setSearching(true);
            timer.current = setTimeout(async () => {
                const found = await fetchOptions(path, term);
                const groups = new Map<string, SelectOption[]>();
                const entries: Entry[] = [];
                for (const o of found) {
                    if (o.group) {
                        if (!groups.has(o.group)) {
                            const list: SelectOption[] = [];
                            groups.set(o.group, list);
                            entries.push({ group: o.group, options: list });
                        }
                        groups.get(o.group)!.push({ value: String(o.value), label: o.label });
                    } else entries.push({ value: String(o.value), label: o.label });
                }
                setResults(entries);
                setSearching(false);
            }, searchDebounce);
        },
        [dynamic, fetchOptions, path, searchDebounce],
    );

    // close on outside click / escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const toggleOpen = () => {
        if (disabled) return;
        if (open) return setOpen(false);
        setOpen(true);
        setSearch('');
        setActive(0);
        if (dynamic && results === null) runSearch('');
        requestAnimationFrame(() => {
            searchInput.current?.focus();
            const r = button.current?.getBoundingClientRect();
            if (r) setPanelTop(`${r.height + 4}px`);
        });
    };

    const live0 = live ? { ...live, debounce: 0 } : undefined;
    const choose = (v: string) => {
        if (multiple) {
            const set = selected.includes(v) ? selected.filter((s) => s !== v) : maxItems && selected.length >= maxItems ? selected : [...selected, v];
            setValue(set, live0);
        } else {
            setValue(v === '' ? null : v, live0);
            setOpen(false);
            button.current?.focus();
        }
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) return toggleOpen();
            setActive((a) => Math.min(a + 1, flatVisible.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const o = flatVisible[active];
            if (o && !o.disabled && !disabledValues.includes(o.value)) choose(o.value);
        } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
            button.current?.focus();
        }
    };

    const isClearable = clearable && !multiple && selected.length > 0;
    const label = (v: string) => labels[v] ?? v;

    const optionNode = (o: SelectOption) => {
        const idx = flatVisible.findIndex((x) => x.value === o.value);
        const isDisabled = o.disabled || disabledValues.includes(o.value);
        return (
            <li
                key={o.value}
                className={cn('fi-dropdown-list-item', 'fi-select-input-option', isDisabled && 'fi-disabled', selected.includes(o.value) && 'fi-selected')}
                id={`${dropdownId}-${o.value}`}
                role="option"
                data-value={o.value}
                tabIndex={0}
                aria-selected={selected.includes(o.value)}
                style={idx === active ? { backgroundColor: undefined } : undefined}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDisabled) choose(o.value);
                    if (multiple) setTimeout(() => searchInput.current?.focus(), 0);
                }}
            >
                <span>{o.label}</span>
            </li>
        );
    };

    const maxReached = multiple && maxItems !== undefined && selected.length >= maxItems;

    return (
        <div className="fi-select-input" onKeyDown={onKey} ref={wrap}>
            <div>
                <div className={cn('fi-select-input-ctn', isClearable && 'fi-select-input-ctn-clearable')}>
                    <button
                        ref={button}
                        className={cn('fi-select-input-btn', disabled && 'fi-disabled')}
                        type="button"
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        id={id}
                        aria-controls={dropdownId}
                        disabled={disabled}
                        onClick={toggleOpen}
                    >
                        <div className="fi-select-input-value-ctn">
                            {selected.length === 0 ? (
                                <span className="fi-select-input-placeholder">{placeholder}</span>
                            ) : multiple ? (
                                <div className="fi-select-input-value-badges-ctn">
                                    {selected.map((v) => (
                                        <span key={v} data-value={v} className="fi-badge fi-size-md fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-200">
                                            <span className="fi-badge-label-ctn">
                                                <span className="fi-badge-label">{label(v)}</span>
                                            </span>
                                            <span
                                                role="button"
                                                tabIndex={disabled ? -1 : 0}
                                                className="fi-badge-delete-btn"
                                                aria-label={`Remove ${label(v)}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!disabled) choose(v);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === ' ' || e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (!disabled) choose(v);
                                                    }
                                                }}
                                            >
                                                <Cross size="xs" />
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className="fi-select-input-value-label">{label(selected[0])}</span>
                            )}
                        </div>
                    </button>
                    {open && (
                        <div className="fi-dropdown-panel fi-scrollable" role="listbox" tabIndex={-1} id={dropdownId} aria-multiselectable={multiple || undefined} style={{ top: panelTop, left: 0 }}>
                            {searchable && (
                                <div className="fi-select-input-search-ctn">
                                    <input
                                        ref={searchInput}
                                        className="fi-input"
                                        type="text"
                                        placeholder={searchPrompt}
                                        aria-label="Search"
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setActive(0);
                                            if (dynamic) runSearch(e.target.value);
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                    />
                                </div>
                            )}
                            {searching ? (
                                <div className="fi-select-input-message">{searchingMessage}</div>
                            ) : flatVisible.length === 0 ? (
                                <div className="fi-select-input-message">{search ? noSearchResultsMessage : dynamic && searchable && results === null ? searchPrompt : noOptionsMessage}</div>
                            ) : visible.some((e) => 'group' in e) ? (
                                <ul className="fi-select-input-options-ctn">
                                    {visible.map((e) =>
                                        'group' in e ? (
                                            <li key={e.group} className="fi-select-input-option-group">
                                                <div className="fi-dropdown-header">{e.group}</div>
                                                <ul className="fi-dropdown-list">{e.options.slice(0, optionsLimit).map(optionNode)}</ul>
                                            </li>
                                        ) : (
                                            <ul key={e.value} className="fi-dropdown-list">
                                                {optionNode(e)}
                                            </ul>
                                        ),
                                    )}
                                </ul>
                            ) : (
                                <ul className="fi-dropdown-list">{flatVisible.slice(0, optionsLimit).map(optionNode)}</ul>
                            )}
                            {maxReached && maxItemsMessage && <div className="fi-select-input-max-items-message">{maxItemsMessage}</div>}
                        </div>
                    )}
                    <div className="fi-sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
                    {isClearable && (
                        <button type="button" className="fi-select-input-value-remove-btn" aria-label={selectedLabel || 'Clear selection'} onClick={(e) => (e.stopPropagation(), choose(''))}>
                            <Cross size="sm" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
