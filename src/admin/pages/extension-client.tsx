'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@themes/default/components/cn';

/** the URL state of the page (`tab`, `q`, `filter`, `n`) */
export function useUrlState() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    return (updates: Record<string, string | null>) => {
        const next = new URLSearchParams(params.toString());
        for (const [k, v] of Object.entries(updates)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
}

export function ExtensionTabs({ active, children }: { active: string; children: ReactNode }) {
    const set = useUrlState();
    const tab = (key: string, label: string) => (
        <button
            type="button"
            onClick={() => set({ tab: key === 'marketplace' ? null : key, n: null })}
            className={cn('whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm', active === key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600')}
        >
            {label}
        </button>
    );
    return (
        <>
            <div className="border-b border-gray-200 dark:border-white/10">
                <nav className="flex -mb-px space-x-8" aria-label="Tabs">
                    {tab('marketplace', 'Browse Marketplace')}
                    {tab('installable', 'Ready to Install / Upload')}
                </nav>
            </div>
            {children}
        </>
    );
}

export function MarketplaceFilters({ search, filter, searchIcon }: { search: string; filter: string; searchIcon: ReactNode }) {
    const set = useUrlState();
    const [q, setQ] = useState(search);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const base = 'px-4 py-2 text-sm font-medium border rounded-lg focus:outline-none transition-colors';
    const active = 'bg-primary-600 border-primary-600 text-white hover:bg-primary-700';
    const inactive = 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
    const button = (key: string, label: string) => (
        <button type="button" onClick={() => set({ filter: key === 'all' ? null : key, n: null })} className={cn(base, filter === key ? active : inactive)}>
            {label}
        </button>
    );
    return (
        <div className="flex flex-col gap-4">
            <div className="relative">
                <div className="absolute inset-y-0 flex items-center pointer-events-none start-0 ps-3">{searchIcon}</div>
                <input
                    type="search"
                    placeholder="Search extensions by name..."
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        if (timer.current) clearTimeout(timer.current);
                        timer.current = setTimeout(() => set({ q: e.target.value, n: null }), 500);
                    }}
                    className="block w-full p-3 border-gray-300 rounded-lg shadow-sm ps-10 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500"
                />
            </div>
            <div className="flex items-center space-x-2">
                {button('all', 'All')}
                {button('extension', 'Extensions')}
                {button('theme', 'Themes')}
            </div>
        </div>
    );
}

/** `loadMore()`: grows the list when the trigger scrolls into view */
export function LoadMore({ next }: { next: number }) {
    const set = useUrlState();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && set({ n: String(next) }), { rootMargin: '200px' });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [next]);
    return <div id="load-more-trigger" ref={ref} className="flex items-center justify-center w-full h-16" />;
}
