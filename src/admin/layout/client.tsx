'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { colorClass } from '../ui/colors';
import type { NotificationData } from '../Notification';

/* ---------------------------------------------------------------------------------------------
 * `$store.sidebar` / `$store.theme` of the Alpine app, as React state
 * ------------------------------------------------------------------------------------------- */

interface SidebarState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    collapsedGroups: string[];
    toggleGroup: (label: string) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);
const useSidebar = () => useContext(SidebarContext)!;

export function SidebarRoot({ children }: { children: ReactNode }) {
    const [isOpen, setOpen] = useState(false);
    const [collapsedGroups, setCollapsed] = useState<string[]>([]);

    useEffect(() => {
        try {
            setCollapsed(JSON.parse(localStorage.getItem('collapsedGroups') ?? '[]'));
        } catch {
            /* storage unavailable */
        }
    }, []);

    const toggleGroup = useCallback((label: string) => {
        setCollapsed((current) => {
            const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
            try {
                localStorage.setItem('collapsedGroups', JSON.stringify(next));
            } catch {
                /* storage unavailable */
            }
            return next;
        });
    }, []);

    return <SidebarContext.Provider value={{ isOpen, open: () => setOpen(true), close: () => setOpen(false), collapsedGroups, toggleGroup }}>{children}</SidebarContext.Provider>;
}

/** the two icon buttons at the start of the topbar (mobile) */
export function SidebarToggleButtons({ expandLabel, collapseLabel }: { expandLabel: string; collapseLabel: string }) {
    const sidebar = useSidebar();
    return (
        <>
            {!sidebar.isOpen && (
                <button className={`fi-icon-btn fi-size-md fi-topbar-open-sidebar-btn ${colorClass('iconButton', 'gray')}`} title={expandLabel} aria-label={expandLabel} type="button" aria-controls="fi-main-sidebar" aria-expanded={false} onClick={sidebar.open}>
                    <Icon icon="heroicon-o-bars-3" size="lg" />
                </button>
            )}
            {sidebar.isOpen && (
                <button className={`fi-icon-btn fi-size-md fi-topbar-close-sidebar-btn ${colorClass('iconButton', 'gray')}`} title={collapseLabel} aria-label={collapseLabel} type="button" aria-controls="fi-main-sidebar" aria-expanded={true} onClick={sidebar.close}>
                    <Icon icon="heroicon-o-x-mark" size="lg" />
                </button>
            )}
        </>
    );
}

export function SidebarOverlay() {
    const sidebar = useSidebar();
    return sidebar.isOpen ? <div className="fi-sidebar-close-overlay" onClick={sidebar.close} /> : null;
}

export function SidebarPanel({ children }: { children: ReactNode }) {
    const sidebar = useSidebar();
    return (
        <div id="fi-main-sidebar" className={`fi-sidebar fi-main-sidebar${sidebar.isOpen ? ' fi-sidebar-open' : ''}`}>
            {children}
        </div>
    );
}

export function SidebarGroup({ label, id, active, collapsible = true, children }: { label: string | null; id: string; active?: boolean; collapsible?: boolean; children: ReactNode }) {
    const sidebar = useSidebar();
    const collapsed = !!label && collapsible && sidebar.collapsedGroups.includes(label);
    return (
        <li data-group-label={label ?? ''} className={`fi-sidebar-group${active ? ' fi-active' : ''}${collapsible ? ' fi-collapsible' : ''}${collapsed ? ' fi-collapsed' : ''}`}>
            {label && (
                <div className="fi-sidebar-group-btn" onClick={() => sidebar.toggleGroup(label)}>
                    <span className="fi-sidebar-group-label">{label}</span>
                    {collapsible && (
                        <button className={`fi-icon-btn fi-size-md fi-sidebar-group-collapse-btn ${colorClass('iconButton', 'gray')}`} title={label} aria-label={label} type="button" aria-controls={id} aria-expanded={!collapsed}>
                            <Icon icon="heroicon-m-chevron-up" />
                        </button>
                    )}
                </div>
            )}
            <ul id={id} className="fi-sidebar-group-items" style={collapsed ? { display: 'none' } : undefined}>
                {children}
            </ul>
        </li>
    );
}

/** closes the mobile sidebar when an item is followed */
export function SidebarLink({ href, className, children, ...rest }: { href: string; className: string; children: ReactNode; 'aria-current'?: 'page' }) {
    const sidebar = useSidebar();
    return (
        <Link href={href} className={className} onClick={() => window.matchMedia('(max-width: 1024px)').matches && sidebar.close()} {...rest}>
            {children}
        </Link>
    );
}

/* ---------------------------------------------------------------------------------------------
 * Dropdown (`x-data="filamentDropdown"`)
 * ------------------------------------------------------------------------------------------- */

export function Dropdown({
    trigger,
    children,
    placement = 'bottom-end',
    className = '',
    panelClassName = '',
    width,
    disabled,
    wrapperProps,
}: {
    trigger: ReactNode;
    children: ReactNode | ((close: () => void) => ReactNode);
    placement?: 'bottom-end' | 'bottom-start';
    className?: string;
    panelClassName?: string;
    width?: string;
    disabled?: boolean;
    wrapperProps?: Record<string, any>;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const close = () => setOpen(false);
    return (
        <div ref={ref} className={`fi-dropdown ${className}`.trim()} style={{ position: 'relative' }} {...wrapperProps}>
            <div className="fi-dropdown-trigger" onMouseDown={(e) => e.button === 0 && !disabled && setOpen((o) => !o)}>
                {trigger}
            </div>
            {open && (
                <div className={`fi-dropdown-panel ${width ? `fi-width-${width}` : ''} ${panelClassName}`.trim()} style={{ top: 'calc(100% + 8px)', ...(placement === 'bottom-end' ? { right: 0 } : { left: 0 }) }}>
                    {typeof children === 'function' ? children(close) : children}
                </div>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------------------------------
 * user menu + theme switcher
 * ------------------------------------------------------------------------------------------- */

function applyTheme(theme: string) {
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
}

export function ThemeSwitcher({ labels }: { labels: { light: string; dark: string; system: string; group: string } }) {
    const [theme, setTheme] = useState('system');
    useEffect(() => {
        try {
            setTheme(localStorage.getItem('theme') || 'system');
        } catch {
            /* storage unavailable */
        }
    }, []);
    const choose = (next: string) => {
        setTheme(next);
        try {
            localStorage.setItem('theme', next);
        } catch {
            /* storage unavailable */
        }
        applyTheme(next);
    };
    const button = (value: 'light' | 'dark' | 'system', icon: string, label: string) => (
        <button aria-label={label} title={label} type="button" onClick={() => choose(value)} aria-pressed={theme === value} className={`fi-icon-btn fi-size-md fi-theme-switcher-btn${theme === value ? ' fi-active' : ''} ${colorClass('iconButton', 'gray')}`}>
            <Icon icon={icon} />
        </button>
    );
    return (
        <div role="group" aria-label={labels.group} className="fi-theme-switcher">
            {button('light', 'heroicon-m-sun', labels.light)}
            {button('dark', 'heroicon-m-moon', labels.dark)}
            {button('system', 'heroicon-m-computer-desktop', labels.system)}
        </div>
    );
}

export function UserMenu({ name, avatarUrl, items, themeLabels, userMenuLabel }: { name: string; avatarUrl: string; items: Array<{ label: string; icon: string; href?: string; action?: 'logout' }>; themeLabels: { light: string; dark: string; system: string; group: string }; userMenuLabel: string }) {
    return (
        <Dropdown
            className="fi-user-menu"
            panelClassName=""
            trigger={
                <button aria-label={userMenuLabel} type="button" className="fi-user-menu-trigger">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Avatar of ${name}`} className="fi-avatar fi-circular fi-size-md fi-user-avatar" src={avatarUrl} loading="lazy" />
                </button>
            }
        >
            {(close) => (
                <>
                    <div className="fi-dropdown-header">
                        <Icon icon="heroicon-m-user-circle" />
                        <span>{name}</span>
                    </div>
                    <div className="fi-dropdown-list">
                        <ThemeSwitcher labels={themeLabels} />
                    </div>
                    <div className="fi-dropdown-list">
                        {items.map((item) =>
                            item.href ? (
                                <Link key={item.label} href={item.href} onClick={close} className="fi-dropdown-list-item fi-ac-grouped-action">
                                    <Icon icon={item.icon} />
                                    <span className="fi-dropdown-list-item-label">{item.label}</span>
                                </Link>
                            ) : (
                                <LogoutItem key={item.label} item={item} />
                            ),
                        )}
                    </div>
                </>
            )}
        </Dropdown>
    );
}

function LogoutItem({ item }: { item: { label: string; icon: string } }) {
    return (
        <form action="/admin/logout" method="post" style={{ display: 'contents' }}>
            <button type="submit" className="fi-dropdown-list-item fi-ac-grouped-action">
                <Icon icon={item.icon} />
                <span className="fi-dropdown-list-item-label">{item.label}</span>
            </button>
        </form>
    );
}

/* ---------------------------------------------------------------------------------------------
 * notifications (`Filament\Notifications\Livewire\Notifications`)
 * ------------------------------------------------------------------------------------------- */

const statusIcons: Record<string, { icon: string; color: string }> = {
    success: { icon: 'heroicon-o-check-circle', color: 'success' },
    danger: { icon: 'heroicon-o-x-circle', color: 'danger' },
    warning: { icon: 'heroicon-o-exclamation-triangle', color: 'warning' },
    info: { icon: 'heroicon-o-information-circle', color: 'info' },
};

const NotificationContext = createContext<(n: NotificationData) => void>(() => undefined);
export const useAdminNotify = () => useContext(NotificationContext);

export function NotificationsHost({ initial = [], closeLabel, children }: { initial?: NotificationData[]; closeLabel: string; children?: ReactNode }) {
    const [items, setItems] = useState<NotificationData[]>(initial);
    const seen = useRef(new Set<string>(initial.map((n) => n.id)));

    const push = useCallback((n: NotificationData) => {
        if (seen.current.has(n.id)) return;
        seen.current.add(n.id);
        setItems((list) => [...list, n]);
    }, []);

    useEffect(() => {
        for (const n of initial) push(n);
    }, [initial, push]);

    const close = (id: string) => setItems((list) => list.filter((n) => n.id !== id));

    return (
        <NotificationContext.Provider value={push}>
            {children}
            <div>
                <div className="fi-no fi-align-center fi-vertical-align-start" role="status" aria-atomic="false">
                    {items.map((n) => (
                        <Toast key={n.id} n={n} closeLabel={closeLabel} onClose={() => close(n.id)} />
                    ))}
                </div>
            </div>
        </NotificationContext.Provider>
    );
}

function Toast({ n, closeLabel, onClose }: { n: NotificationData; closeLabel: string; onClose: () => void }) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const raf = requestAnimationFrame(() => setShown(true));
        const timer = n.persistent ? null : setTimeout(onClose, n.duration ?? 6000);
        return () => {
            cancelAnimationFrame(raf);
            if (timer) clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const status = n.status ?? 'info';
    const meta = statusIcons[status] ?? statusIcons.info;
    return (
        <div role={status === 'danger' ? 'alert' : undefined} className={`fi-no-notification ${colorClass('notification', meta.color)} fi-status-${status}${shown ? '' : ' fi-transition-enter-start'}`} style={{ visibility: 'visible' }}>
            <Icon icon={n.icon ?? meta.icon} size="lg" className={`fi-no-notification-icon ${colorClass('notificationIcon', n.iconColor ?? meta.color)}`} />
            <div className="fi-no-notification-main">
                <div className="fi-no-notification-text">
                    {n.title && <h3 className="fi-no-notification-title" dangerouslySetInnerHTML={{ __html: n.title }} />}
                    {n.body && <div className="fi-no-notification-body" dangerouslySetInnerHTML={{ __html: n.body }} />}
                </div>
            </div>
            <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="fi-icon-btn fi-no-notification-close-btn">
                <Icon icon="heroicon-m-x-mark" />
            </button>
        </div>
    );
}


/** notifications sent while the page was rendered (`mount()` hooks): shown once the page is on screen */
export function PageNotifications({ items }: { items: NotificationData[] }) {
    const notify = useAdminNotify();
    const shown = useRef<Set<string>>(new Set());
    useEffect(() => {
        for (const n of items) {
            if (shown.current.has(n.id)) continue;
            shown.current.add(n.id);
            notify(n);
        }
    }, [items, notify]);
    return null;
}
