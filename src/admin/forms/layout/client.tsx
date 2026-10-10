'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '@themes/default/components/cn';

const readStored = (key: string | undefined, fallback: boolean) => {
    if (!key) return fallback;
    try {
        const v = window.localStorage.getItem(`_x_${key}`);
        return v === null ? fallback : JSON.parse(v) === true;
    } catch {
        return fallback;
    }
};

/** `<section class="fi-section">` with the Alpine collapse behaviour of Filament */
export function SectionShell({
    className,
    collapsible,
    initiallyCollapsed,
    persistKey,
    contentId,
    hasContent,
    header,
    labelledBy,
    describedBy,
    collapseLabel,
    expandLabel,
    children,
}: {
    className: string;
    collapsible: boolean;
    initiallyCollapsed: boolean;
    persistKey?: string;
    contentId?: string;
    hasContent: boolean;
    header: ReactNode;
    labelledBy?: string;
    describedBy?: string;
    collapseLabel: string;
    expandLabel: string;
    children: ReactNode;
}) {
    const [collapsed, setCollapsed] = useState(initiallyCollapsed);
    useEffect(() => {
        if (persistKey) setCollapsed(readStored(persistKey, initiallyCollapsed));
    }, [persistKey, initiallyCollapsed]);
    const toggle = () =>
        setCollapsed((c) => {
            const next = !c;
            if (persistKey) {
                try {
                    window.localStorage.setItem(`_x_${persistKey}`, JSON.stringify(next));
                } catch {}
            }
            return next;
        });
    const label = collapsed ? expandLabel : collapseLabel;
    return (
        <section aria-labelledby={labelledBy} aria-describedby={describedBy} className={cn(className, collapsible && collapsed && 'fi-collapsed')}>
            {header && (
                <header
                    className="fi-section-header"
                    onClick={
                        collapsible
                            ? (e) => {
                                  if (!(e.target as HTMLElement).closest('.fi-section-header-after-ctn')) toggle();
                              }
                            : undefined
                    }
                >
                    {header}
                    {collapsible && (
                        <button
                            type="button"
                            aria-label={label}
                            aria-expanded={collapsed ? 'false' : 'true'}
                            aria-controls={hasContent ? contentId : undefined}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggle();
                            }}
                            className="fi-icon-btn fi-size-md fi-section-collapse-btn"
                        >
                            <Icon icon="heroicon-m-chevron-up" size="md" />
                        </button>
                    )}
                </header>
            )}
            {hasContent && (
                <div id={contentId} className="fi-section-content-ctn" style={collapsible && collapsed ? { display: 'none' } : undefined}>
                    {children}
                </div>
            )}
        </section>
    );
}

/* ---- tabs ---- */

interface TabsCtx {
    active: string;
}
const TabsContext = createContext<TabsCtx>({ active: '' });

export interface TabItem {
    key: string;
    label: string;
    icon?: string | null;
    iconPosition?: 'before' | 'after';
    badge?: ReactNode;
}

/** `tabsSchemaComponent`: which tab is open, optionally kept in `?tab=` */
export function TabsRoot({
    id,
    tabs,
    activeIndex,
    persistInQueryString,
    queryStringKey,
    persist,
    contained,
    vertical,
    label,
    extra,
    children,
}: {
    id?: string;
    tabs: TabItem[];
    activeIndex: number;
    persistInQueryString: boolean;
    queryStringKey: string;
    persist?: boolean;
    contained: boolean;
    vertical: boolean;
    label?: string | null;
    extra?: Record<string, any>;
    children: ReactNode;
}) {
    const keys = tabs.map((t) => t.key);
    const initial = keys[activeIndex - 1] ?? keys[0] ?? '';
    const [active, setActive] = useState(initial);

    useEffect(() => {
        let next = initial;
        try {
            if (persistInQueryString) {
                const q = new URLSearchParams(window.location.search).get(queryStringKey);
                if (q && keys.includes(q)) next = q;
            } else if (persist && id) {
                const stored = window.localStorage.getItem(`_x_${id}`);
                const parsed = stored ? JSON.parse(stored) : null;
                if (parsed && keys.includes(parsed)) next = parsed;
            }
        } catch {}
        setActive(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // a refreshed schema may drop the open tab
    useEffect(() => {
        if (active && !keys.includes(active)) setActive(initial);
    }, [keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

    const select = (key: string) => {
        setActive(key);
        try {
            if (persistInQueryString) {
                const url = new URL(window.location.href);
                url.searchParams.set(queryStringKey, key);
                window.history.replaceState(null, document.title, url.toString());
            } else if (persist && id) window.localStorage.setItem(`_x_${id}`, JSON.stringify(key));
        } catch {}
    };

    return (
        <TabsContext.Provider value={{ active }}>
            <div id={id} {...extra} className={cn('fi-sc-tabs', contained && 'fi-contained', vertical && 'fi-vertical')}>
                <input type="hidden" defaultValue={JSON.stringify(keys)} />
                <nav aria-label={label ?? undefined} role="tablist" className={cn('fi-tabs', contained && 'fi-contained', vertical && 'fi-vertical')}>
                    {tabs.map((t) => (
                        <button key={t.key} type="button" role="tab" aria-selected={active === t.key ? 'true' : 'false'} data-tab-key={t.key} onClick={() => select(t.key)} className={cn('fi-tabs-item', active === t.key && 'fi-active')}>
                            {t.icon && t.iconPosition !== 'after' && <Icon icon={t.icon} />}
                            <span className="fi-tabs-item-label">{t.label}</span>
                            {t.icon && t.iconPosition === 'after' && <Icon icon={t.icon} />}
                            {t.badge}
                        </button>
                    ))}
                </nav>
                {children}
            </div>
        </TabsContext.Provider>
    );
}

/** a tab panel: visible while its tab is the open one */
export function TabPanel({ tabKey, id, extra, children }: { tabKey: string; id?: string; extra?: Record<string, any>; children: ReactNode }) {
    const { active } = useContext(TabsContext);
    return (
        <div aria-labelledby={id} id={id} role="tabpanel" {...extra} className={cn('fi-sc-tabs-tab', active === tabKey && 'fi-active')}>
            {children}
        </div>
    );
}
