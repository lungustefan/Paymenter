'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useUrlState } from './extension-client';
import { useAdminActions } from '../actions/client';

/** the web updater: the "Update" button (confirmed) and the console output (`ansi_up`) */
export function UpdateRunner({ children }: { children: ReactNode }) {
    const { dispatch, apply } = useAdminActions();
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!window.confirm('Are you sure?')) return;
        setBusy(true);
        try {
            const result = apply(await dispatch({ type: 'page', method: 'update' }));
            const text = String((result.data as any)?.output ?? '');
            if (!(window as any).AnsiUp) {
                await new Promise<void>((resolve) => {
                    const s = document.createElement('script');
                    s.src = '/js/ansi_up/ansi_up.min.js';
                    s.onload = () => resolve();
                    document.head.appendChild(s);
                });
            }
            setOutput(new (window as any).AnsiUp().ansi_to_html(text));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="mt-2" onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest('[data-update-button]')) {
                    e.preventDefault();
                    if (!busy) void run();
                }
            }}>
                {children}
            </div>
            <code>
                <pre id="update-result" className="mt-2" dangerouslySetInnerHTML={{ __html: output }} />
            </code>
        </>
    );
}

/** search box and the "Used integrations only" filter of the extensions table (URL state: `q`, `all`) */
export function AddonFilters({ search, usedOnly }: { search: string; usedOnly: boolean }) {
    const set = useUrlState();
    const [q, setQ] = useState(search);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    return (
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
            <input
                type="search"
                aria-label="Search"
                placeholder="Search"
                value={q}
                onChange={(e) => {
                    setQ(e.target.value);
                    if (timer.current) clearTimeout(timer.current);
                    timer.current = setTimeout(() => set({ q: e.target.value }), 400);
                }}
                className="fi-input block rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
            />
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" data-filter-used checked={usedOnly} onChange={(e) => set({ all: e.target.checked ? null : '1' })} />
                Used integrations only
            </label>
        </div>
    );
}

/** a sortable column header (URL state: `sort`, `dir`) */
export function SortHeader({ column, label, sort, dir }: { column: string; label: string; sort: string; dir: string }) {
    const set = useUrlState();
    const active = sort === column;
    return (
        <button type="button" className="fi-ta-header-cell-sort-btn" onClick={() => set({ sort: column, dir: active && dir === 'asc' ? 'desc' : 'asc' })}>
            <span className="fi-ta-header-cell-label">{label}</span>
            {active && <span aria-hidden>{dir === 'asc' ? ' ↑' : ' ↓'}</span>}
        </button>
    );
}
