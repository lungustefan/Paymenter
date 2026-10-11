'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { globalSearch, type SearchGroup } from '../search';

/** `Filament\Livewire\GlobalSearch`: results load 500ms after typing stops */
export function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [groups, setGroups] = useState<SearchGroup[] | null>(null);
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef(0);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (!query.trim()) {
            setGroups(null);
            return;
        }
        const id = ++latest.current;
        timer.current = setTimeout(async () => {
            const result = await globalSearch(query);
            if (id === latest.current) {
                setGroups(result);
                setOpen(true);
            }
        }, 500);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [query]);

    // clicking away closes the results
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div className="fi-global-search-ctn" ref={root}>
            <div className="fi-global-search">
                <div className="fi-global-search-field">
                    <label className="fi-sr-only" htmlFor="global-search-input">
                        Global search
                    </label>
                    <div className="fi-input-wrp">
                        <div className="fi-input-wrp-prefix fi-input-wrp-prefix-has-content fi-inline">
                            <Icon icon="heroicon-m-magnifying-glass" />
                        </div>
                        <div className="fi-input-wrp-content-ctn">
                            <input id="global-search-input" autoComplete="off" maxLength={1000} placeholder="Search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setOpen(true)} className="fi-input fi-input-has-inline-prefix" />
                        </div>
                    </div>
                </div>
                {open && groups !== null && (
                    <div className="fi-global-search-results-ctn">
                        {groups.length === 0 ? (
                            <div className="fi-global-search-no-results-message">No results found.</div>
                        ) : (
                            <ul className="fi-global-search-results">
                                {groups.map((group) => (
                                    <li key={group.label} className="fi-global-search-result-group">
                                        <h3 className="fi-global-search-result-group-header">{group.label}</h3>
                                        <ul className="fi-global-search-result-group-results">
                                            {group.results.map((result) => (
                                                <li key={result.url} className="fi-global-search-result">
                                                    <Link href={result.url} className="fi-global-search-result-link" onClick={() => setOpen(false)}>
                                                        <h4 className="fi-global-search-result-heading">{result.title}</h4>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
