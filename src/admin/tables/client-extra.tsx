'use client';

import { useState, type ReactNode } from 'react';
import { useTable } from './client';
import { FormProvider } from '../forms/runtime';
import { Dropdown } from '../layout/client';
import { cn } from '@themes/default/components/cn';

/** `fi-ta-header-ctn`: hidden until records are selected when the table only has bulk actions */
export function TableHeaderCtn({ mode, children }: { mode: 'visible' | 'selection' | 'hidden'; children: ReactNode }) {
    const t = useTable();
    const hidden = mode === 'selection' && t.selected.length === 0;
    return (
        <div className="fi-ta-header-ctn" style={hidden ? { display: 'none' } : undefined}>
            {children}
        </div>
    );
}

export function ToolbarWrapper({ mode, children }: { mode: 'visible' | 'selection' | 'hidden'; children: ReactNode }) {
    const t = useTable();
    return (
        <div className="fi-ta-header-toolbar" style={mode === 'selection' && t.selected.length === 0 ? { display: 'none' } : undefined}>
            {children}
        </div>
    );
}

/** enable / disable reordering (`?reordering=1`) */
export function ReorderTrigger({ reordering, prefixParam, labels }: { reordering: boolean; prefixParam: string; labels: { enable: string; disable: string } }) {
    const t = useTable();
    const label = reordering ? labels.disable : labels.enable;
    return (
        <button
            title={label}
            aria-label={label}
            type="button"
            className="fi-ac-icon-btn-action fi-icon-btn fi-size-md"
            onClick={() => t.go({ [prefixParam]: reordering ? null : '1', page: null })}
        >
            <svg className="fi-icon fi-size-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" data-slot="icon">
                <path d="M2 6.75a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 6.75ZM2 13.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
            </svg>
        </button>
    );
}

/** `fi-ta-filter-indicators`: the badges of the active filters (and the search) with a remove button */
export function FilterIndicators({ indicators, prefix, labels }: { indicators: Array<{ label: string; remove?: { filter: string } | 'search' }>; prefix: string; labels: { heading: string; remove: string; removeAll: string } }) {
    const t = useTable();
    const key = (k: string) => (prefix ? `${prefix}.${k}` : k);
    return (
        <div className="fi-ta-filter-indicators">
            <div>
                <span className="fi-ta-filter-indicators-label">{labels.heading}</span>
                <div className="fi-ta-filter-indicators-badges-ctn">
                    {indicators.map((i, n) => (
                        <span key={n} className="fi-badge fi-size-md fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-200">
                            <span className="fi-badge-label-ctn">
                                <span className="fi-badge-label">{i.label}</span>
                            </span>
                            {i.remove && (
                                <button
                                    type="button"
                                    className="fi-badge-delete-btn"
                                    title={labels.remove}
                                    aria-label={labels.remove}
                                    onClick={() => (i.remove === 'search' ? t.go({ [key('search')]: null, page: null }) : t.go({ [`${key('filters')}[${(i.remove as { filter: string }).filter}]`]: null, page: null }))}
                                >
                                    <svg className="fi-icon fi-size-xs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
                                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                                    </svg>
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            </div>
            <button type="button" className="fi-icon-btn fi-size-sm" title={labels.removeAll} aria-label={labels.removeAll} onClick={() => t.go({ [key('search')]: null, [key('filters')]: null, page: null })}>
                <svg className="fi-icon fi-size-sm" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
            </button>
        </div>
    );
}

/** the filters dropdown of the toolbar: the filters form, "Reset" and "Apply filters" */
export function FiltersPanel({
    form,
    initialState,
    activeCount,
    deferred,
    prefix,
    labels,
    triggerIcon,
    applyClass,
}: {
    form: ReactNode;
    initialState: Record<string, any>;
    activeCount: number;
    deferred: boolean;
    prefix: string;
    labels: { heading: string; reset: string; apply: string; filter: string };
    triggerIcon: ReactNode;
    applyClass: string;
}) {
    const t = useTable();
    const key = prefix ? `${prefix}.filters` : 'filters';
    const [open, setOpen] = useState(false);
    void open;
    void setOpen;
    const apply = (state: Record<string, any>) => {
        const cleaned: Record<string, any> = {};
        for (const [name, values] of Object.entries(state)) {
            const filtered = Object.fromEntries(Object.entries(values ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)));
            if (Object.keys(filtered).length) cleaned[name] = filtered;
        }
        t.go({ [key]: Object.keys(cleaned).length ? cleaned : null, page: null });
        t.clear();
    };
    return (
        <Dropdown
            className="fi-ta-filters-dropdown"
            placement="bottom-end"
            width="xs"
            trigger={
                <button title={labels.filter} aria-label={labels.filter} type="button" className="fi-force-enabled fi-ac-icon-btn-action fi-icon-btn fi-size-md">
                    {triggerIcon}
                    <div className="fi-icon-btn-badge-ctn">
                        <span className="fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-200 fi-badge fi-size-xs">{activeCount}</span>
                    </div>
                </button>
            }
        >
            <FormProvider formId="tableFiltersForm" as="div" className="fi-ta-filters" initialState={initialState} schema={form} target={{ kind: 'form', id: 'tableFiltersForm' }} onSubmitLocal={apply}>
                <FiltersBody labels={labels} apply={apply} deferred={deferred} applyClass={applyClass} />
            </FormProvider>
        </Dropdown>
    );
}

import { SchemaSlot, useFormContext } from '../forms/runtime';

function FiltersBody({ labels, apply, deferred, applyClass }: { labels: { heading: string; reset: string; apply: string }; apply: (state: Record<string, any>) => void; deferred: boolean; applyClass: string }) {
    const f = useFormContext();
    const t = useTable();
    return (
        <>
            <div className="fi-ta-filters-header">
                <h3 className="fi-ta-filters-heading">{labels.heading}</h3>
                <div>
                    <button type="button" className={cn('fi-color fi-color-danger fi-text-color-600 dark:fi-text-color-300 fi-link fi-size-md')} onClick={() => t.go({ filters: null, page: null })}>
                        <span className="fi-link-label">{labels.reset}</span>
                    </button>
                </div>
            </div>
            <SchemaSlot />
            {deferred && (
                <div className="fi-ta-filters-actions-ctn">
                    <button type="button" className={applyClass} onClick={() => apply(f.state)}>
                        {labels.apply}
                    </button>
                </div>
            )}
        </>
    );
}

/** `filamentTableColumnManager`: the dropdown that shows / hides the toggleable columns (deferred, with an Apply button) */
export function ColumnManager({
    columns,
    prefix,
    labels,
    triggerIcon,
    resetIcon,
    applyClass,
}: {
    columns: Array<{ name: string; label: string; toggled: boolean }>;
    prefix: string;
    labels: { heading: string; reset: string; apply: string; trigger: string };
    triggerIcon: ReactNode;
    resetIcon: ReactNode;
    applyClass: string;
}) {
    const t = useTable();
    const key = prefix ? `${prefix}.columns` : 'columns';
    const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(columns.map((c) => [c.name, c.toggled])));
    const apply = () => {
        t.go({ [key]: Object.fromEntries(columns.map((c) => [c.name, checked[c.name] ? '1' : '0'])) });
        t.clear();
    };
    return (
        <Dropdown
            className="fi-ta-col-manager-dropdown"
            placement="bottom-end"
            width="xs"
            trigger={
                <button title={labels.trigger} aria-label={labels.trigger} type="button" className="fi-force-enabled fi-ac-icon-btn-action fi-icon-btn fi-size-md">
                    {triggerIcon}
                </button>
            }
        >
            <div className="fi-ta-col-manager">
                <div className="fi-ta-col-manager-header">
                    <h2 className="fi-ta-col-manager-heading">{labels.heading}</h2>
                    <div>
                        <button
                            type="button"
                            className="fi-color fi-color-danger fi-text-color-600 dark:fi-text-color-300 fi-link fi-size-md"
                            onClick={() => {
                                t.go({ [key]: null });
                                t.clear();
                            }}
                        >
                            {resetIcon}
                            <span className="fi-link-label">{labels.reset}</span>
                        </button>
                    </div>
                </div>
                <div className="fi-grid fi-grid-direction-col lg:fi-grid-cols fi-ta-col-manager-items" style={{ '--cols-lg': 1, '--cols-default': 1 } as any}>
                    {columns.map((c) => (
                        <div key={c.name}>
                            <div className="fi-ta-col-manager-item">
                                <label className="fi-ta-col-manager-label">
                                    <input type="checkbox" className="fi-checkbox-input fi-valid" checked={!!checked[c.name]} onChange={(e) => setChecked((s) => ({ ...s, [c.name]: e.target.checked }))} />
                                    <span dangerouslySetInnerHTML={{ __html: c.label }} />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="fi-ta-col-manager-actions-ctn">
                    <button type="button" className={applyClass} onClick={apply}>
                        {labels.apply}
                    </button>
                </div>
            </div>
        </Dropdown>
    );
}
