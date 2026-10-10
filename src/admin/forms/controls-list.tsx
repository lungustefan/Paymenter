'use client';

import { useMemo, useState } from 'react';
import { useFieldValue, useInvalidClass } from './runtime';
import { Icon } from '../ui/Icon';
import { gridProps } from '../ui/grid';
import { cn } from '@themes/default/components/cn';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;
export interface ListOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

const linkClass = 'fi-ac-link-action fi-link fi-size-sm fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-300';

/** `checkboxListFormComponent` (search, select / deselect all) around the options grid */
export function CheckboxListControl({
    path,
    id,
    options,
    columns,
    direction,
    disabled,
    live,
    searchable,
    bulkToggleable,
    searchPrompt,
    noSearchResultsMessage,
    selectAllLabel,
    deselectAllLabel,
}: {
    path: string;
    id: string;
    options: ListOption[];
    columns: number | Record<string, number> | null;
    direction: 'row' | 'col';
    disabled?: boolean;
    live?: Live;
    searchable?: boolean;
    bulkToggleable?: boolean;
    searchPrompt: string;
    noSearchResultsMessage: string;
    selectAllLabel: string;
    deselectAllLabel: string;
}) {
    const [value, setValue] = useFieldValue(path);
    const invalid = useInvalidClass(path);
    const [search, setSearch] = useState('');
    const selected: string[] = Array.isArray(value) ? value.map(String) : [];
    const needle = search.toLowerCase();

    const visible = useMemo(
        () => options.filter((o) => !needle || o.label.toLowerCase().includes(needle) || (o.description ?? '').toLowerCase().includes(needle)),
        [options, needle],
    );
    const enabledVisible = visible.filter((o) => !o.disabled);
    const allChecked = enabledVisible.length > 0 && enabledVisible.every((o) => selected.includes(o.value));
    const commit = (next: string[]) => setValue(next, live ? { ...live, debounce: 0 } : undefined);

    const toggle = (v: string, checked: boolean) => commit(checked ? [...selected.filter((s) => s !== v), v] : selected.filter((s) => s !== v));
    const toggleAll = () => {
        if (allChecked) commit(selected.filter((s) => !enabledVisible.some((o) => o.value === s)));
        else commit([...selected, ...enabledVisible.filter((o) => !selected.includes(o.value)).map((o) => o.value)]);
    };

    const grid = gridProps(columns ?? undefined, direction);

    return (
        <div aria-labelledby={`${id}-label`} role="group" className="fi-fo-checkbox-list">
            {searchable && (
                <div className={cn('fi-input-wrp fi-fo-checkbox-list-search-input-wrp', invalid && 'fi-invalid')}>
                    <div className="fi-input-wrp-prefix fi-input-wrp-prefix-has-content fi-inline">
                        <Icon icon="heroicon-m-magnifying-glass" size="md" />
                    </div>
                    <div className="fi-input-wrp-content-ctn">
                        <input aria-label={searchPrompt} placeholder={searchPrompt} type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="fi-input fi-input-has-inline-prefix" />
                    </div>
                </div>
            )}
            {bulkToggleable && !disabled && (
                <div className="fi-fo-checkbox-list-actions">
                    <span style={allChecked ? { display: 'none' } : undefined} onClick={toggleAll}>
                        <button type="button" className={linkClass}>
                            <span className="fi-link-label">{selectAllLabel}</span>
                        </button>
                    </span>
                    <span style={allChecked ? undefined : { display: 'none' }} onClick={toggleAll}>
                        <button type="button" className={linkClass}>
                            <span className="fi-link-label">{deselectAllLabel}</span>
                        </button>
                    </span>
                </div>
            )}
            <div className={cn(grid.className, 'fi-fo-checkbox-list-options')} style={{ ...grid.style, ...(visible.length ? {} : { display: 'none' }) }}>
                {options.map((o) => {
                    const shown = visible.includes(o);
                    return (
                        <div key={o.value} style={shown ? undefined : { display: 'none' }} className="fi-fo-checkbox-list-option-ctn">
                            <label className="fi-fo-checkbox-list-option">
                                <input
                                    type="checkbox"
                                    value={o.value}
                                    checked={selected.includes(o.value)}
                                    disabled={disabled || o.disabled}
                                    onChange={(e) => toggle(o.value, e.target.checked)}
                                    className={cn('fi-checkbox-input', invalid ? 'fi-invalid' : 'fi-valid')}
                                />
                                <div className="fi-fo-checkbox-list-option-text">
                                    <span className="fi-fo-checkbox-list-option-label">{o.label}</span>
                                    {o.description && <p className="fi-fo-checkbox-list-option-description">{o.description}</p>}
                                </div>
                            </label>
                        </div>
                    );
                })}
            </div>
            {search && visible.length === 0 && (
                <div role="status" aria-live="polite" className="fi-fo-checkbox-list-no-search-results-message">
                    {noSearchResultsMessage}
                </div>
            )}
        </div>
    );
}

/** `tagsInputFormComponent`: the input + the badges of the tags */
export function TagsInputControl({
    path,
    id,
    disabled,
    placeholder,
    className,
    splitKeys,
    suggestions,
    color,
    prefix,
    suffix,
    deleteLabel,
    addedMessage,
    removedMessage,
    live,
    autoFocus,
}: {
    path: string;
    id: string;
    disabled?: boolean;
    placeholder?: string;
    className: string;
    splitKeys: string[];
    suggestions: string[];
    color: string;
    prefix?: string;
    suffix?: string;
    deleteLabel: string;
    addedMessage: string;
    removedMessage: string;
    live?: Live;
    autoFocus?: boolean;
}) {
    const [value, setValue] = useFieldValue(path);
    const tags: string[] = Array.isArray(value) ? value.map(String) : [];
    const [draft, setDraft] = useState('');
    const [message, setMessage] = useState('');

    const commit = (next: string[]) => setValue(next, live ? { ...live, debounce: 0 } : undefined);
    const create = (raw: string) => {
        const tag = raw.trim();
        setDraft('');
        if (tag === '' || tags.includes(tag)) return;
        commit([...tags, tag]);
        setMessage(addedMessage.replace(':tag', tag));
    };
    const remove = (tag: string) => {
        commit(tags.filter((t) => t !== tag));
        setMessage(removedMessage.replace(':tag', tag));
    };

    return (
        <div>
            <input
                autoComplete="off"
                autoFocus={autoFocus}
                disabled={disabled}
                id={id}
                list={`${id}-suggestions`}
                placeholder={placeholder}
                type="text"
                className={className}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => create(draft)}
                onKeyDown={(e) => {
                    if (['Enter', ...splitKeys].includes(e.key)) {
                        e.preventDefault();
                        e.stopPropagation();
                        create(draft);
                    }
                }}
                onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    e.preventDefault();
                    if (splitKeys.length === 0) return create(text);
                    const pattern = new RegExp(splitKeys.map((k) => k.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'), 'g');
                    const parts = text.split(pattern).map((p) => p.trim()).filter((p) => p !== '' && !tags.includes(p));
                    if (parts.length) commit([...tags, ...new Set(parts)]);
                }}
            />
            <div aria-live="polite" className="fi-sr-only">
                {message}
            </div>
            <datalist id={`${id}-suggestions`}>
                {suggestions.filter((s) => !tags.includes(s)).map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
            <div>
                {tags.length > 0 && (
                    <div className="fi-fo-tags-input-tags-ctn">
                        {tags.map((tag, index) => (
                            <span key={`${tag}-${index}`} className={cn('fi-badge', 'fi-size-md', badgeColorClass(color))}>
                                <span className="fi-badge-label-ctn">
                                    <span className="fi-badge-label">
                                        {prefix}
                                        <span>{tag}</span>
                                        {suffix}
                                    </span>
                                </span>
                                {!disabled && (
                                    <button type="button" onClick={() => remove(tag)} aria-label={`${deleteLabel}: ${tag}`} className="fi-badge-delete-btn">
                                        <Icon icon="heroicon-m-x-mark" size="xs" />
                                    </button>
                                )}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

import { colorClass } from '../ui/colors';
const badgeColorClass = (color: string) => colorClass('badge', color);
