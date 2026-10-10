import type { ReactNode } from 'react';
import Link from 'next/link';
import { config, setting } from '@/server/config';
import { storageUrl } from '@/server/routes';
import type { User } from '@/server/models/User';
import { buildNavigation, clusterNavigation, type NavigationGroup } from '../core/registry';
import type { Cluster, NavigationItemInfo } from '../core/Resource';
import { Icon } from '../ui/Icon';
import { colorClass } from '../ui/colors';
import { SidebarGroup, SidebarLink, SidebarOverlay, SidebarPanel, SidebarRoot, SidebarToggleButtons, UserMenu } from './client';
import { GlobalSearch } from './GlobalSearch';

/** `<x-filament-panels::logo>` */
function Logo() {
    const logo = setting<string | null>('logo');
    const dark = setting<string | null>('logo_dark');
    const name = config<string>('app.name', 'Paymenter');
    const brandName = logo || dark ? null : name;
    const styles = { height: '2rem' };
    const hasDark = !!dark;
    const img = (src: string, cls: string) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${name} logo`} src={src} className={cls} style={styles} />
    );
    const mk = (src: string | null, isDark: boolean) => {
        const cls = ['fi-logo', hasDark && !isDark ? 'fi-logo-light' : '', isDark ? 'fi-logo-dark' : ''].filter(Boolean).join(' ');
        return src ? img(storageUrl(src), cls) : <div className={cls}>{brandName ?? name}</div>;
    };
    return (
        <>
            {mk(logo ? logo : null, false)}
            {hasDark && mk(dark, true)}
        </>
    );
}

function SidebarItem({ item }: { item: NavigationItemInfo }) {
    return (
        <li className={`fi-sidebar-item${item.isActive ? ' fi-active' : ''} fi-sidebar-item-has-url`}>
            <SidebarLink href={item.url} className="fi-sidebar-item-btn" {...(item.isActive ? { 'aria-current': 'page' as const } : {})}>
                <Icon icon={item.isActive ? item.activeIcon : item.icon} size="lg" className="fi-sidebar-item-icon" />
                <span className="fi-sidebar-item-label">{item.label}</span>
                {item.badge ? (
                    <span className="fi-sidebar-item-badge-ctn">
                        <span className={`${colorClass('badge', (item.badgeColor as any) ?? 'primary')} fi-badge fi-size-md`}>
                            <span className="fi-badge-label-ctn">
                                <span className="fi-badge-label">{item.badge}</span>
                            </span>
                        </span>
                    </span>
                ) : null}
            </SidebarLink>
        </li>
    );
}

function slugId(label: string) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** the footer the `SIDEBAR_NAV_END` render hook adds (`<x-admin-footer />`) */
function AdminFooter() {
    const year = new Date().getFullYear();
    const items = [
        { href: 'https://github.com/sponsors/Paymenter', label: 'Sponsor', icon: 'ri-service-fill', cls: 'sponsor' },
        { href: 'https://github.com/Paymenter/Paymenter', label: 'Star us on GitHub', icon: 'ri-star-fill', cls: 'star-git' },
        { href: 'https://paymenter.org/docs/getting-started/introduction', label: 'Documentation', icon: 'ri-book-2-line', cls: 'text-gray-400 dark:text-gray-500' },
    ];
    return (
        <>
            <div className="ring-1 ring-gray-950/5 dark:ring-white/10"></div>
            <span className="text-xs text-gray-400 mt-auto">
                Powered by{' '}
                <a href="https://paymenter.org" target="_blank" className="text-gray-400">
                    Paymenter &copy; {year}
                </a>
            </span>
            <ul className="fi-sidebar-nav-groups -mx-2 flex flex-col gap-y-7">
                <li className="fi-sidebar-group flex flex-col gap-y-1">
                    <ul className="fi-sidebar-group-items flex flex-col gap-y-1">
                        {items.map((i) => (
                            <li key={i.href} className="fi-sidebar-item">
                                <a href={i.href} target="_blank" className="fi-sidebar-item-button relative flex items-center justify-center gap-x-3 rounded-lg px-2 py-2 outline-none transition duration-75 hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5">
                                    <Icon icon={i.icon} size={null} className={`fi-sidebar-item-icon h-6 w-6 ${i.cls}`} />
                                    <span className="fi-sidebar-item-label flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">{i.label}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </li>
            </ul>
            <style>{`
    .btn {
        display: inline-flex;
        align-items: center;
        padding: 10px 15px;
        border-radius: 5px;
        text-decoration: none;
    }

    .btn svg {
        width: 20px;
        height: 20px;
        margin-right: 8px;
    }

    .sponsor {
        fill: #DB61A2;
    }

    .star-git {
        fill: #E3B341;
    }
`}</style>
        </>
    );
}

/** The panel chrome of Filament's `layout.index`: topbar, sidebar and the main container. */
export async function AdminLayout({ user, path, children }: { user: User; path: string; children: ReactNode }) {
    const groups: NavigationGroup[] = await buildNavigation(user, path);
    const name = await user.name();

    return (
        <SidebarRoot>
            <a href="#fi-main-content" className="fi-skip-link fi-sr-only">
                Skip to content
            </a>

            <div className="fi-topbar-ctn">
                <nav aria-label="Topbar" className="fi-topbar">
                    <SidebarToggleButtons expandLabel="Expand sidebar" collapseLabel="Collapse sidebar" />
                    <div className="fi-topbar-start">
                        <Link href="/admin">
                            <Logo />
                        </Link>
                    </div>
                    <div className="fi-topbar-end">
                        <GlobalSearch />
                        <UserMenu
                            name={name}
                            avatarUrl={user.avatarUrl()}
                            userMenuLabel="User menu"
                            themeLabels={{ light: 'Enable light theme', dark: 'Enable dark theme', system: 'Enable system theme', group: 'Theme' }}
                            items={[
                                { label: 'Exit Admin', icon: 'heroicon-s-arrow-uturn-left', href: '/' },
                                { label: 'Sign out', icon: 'heroicon-o-arrow-left-on-rectangle', action: 'logout' },
                            ]}
                        />
                    </div>
                </nav>
            </div>

            <div className="fi-layout">
                <SidebarOverlay />
                <SidebarPanel>
                    <div className="fi-sidebar-header-ctn">
                        <header className="fi-sidebar-header">
                            <div className="fi-sidebar-header-logo-ctn">
                                <Link href="/admin">
                                    <Logo />
                                </Link>
                            </div>
                        </header>
                    </div>
                    <nav aria-label="Sidebar navigation" className="fi-sidebar-nav">
                        <ul className="fi-sidebar-nav-groups">
                            {groups.map((group) => (
                                <SidebarGroup key={group.label ?? 'ungrouped'} label={group.label} id={`fi-sidebar-group-items-${slugId(group.label ?? 'ungrouped')}`} active={group.items.some((i) => i.isActive)} collapsible={!!group.label}>
                                    {group.items.map((item) => (
                                        <SidebarItem key={item.url} item={item} />
                                    ))}
                                </SidebarGroup>
                            ))}
                        </ul>
                        <AdminFooter />
                    </nav>
                </SidebarPanel>

                <div className="fi-main-ctn" style={{ display: 'flex', opacity: 1 }}>
                    <main id="fi-main-content" tabIndex={-1} className="fi-main fi-width-7xl">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarRoot>
    );
}

/** Sub navigation of a cluster (shown beside the content of its pages / resources). */
export async function ClusterSubNavigation({ cluster, user, path }: { cluster: typeof Cluster; user: User; path: string }) {
    const items = await clusterNavigation(cluster, user, path);
    return (
        <div className="fi-page-sub-navigation-sidebar-ctn">
            <ul className="fi-page-sub-navigation-sidebar">
                <li data-group-label="sub_navigation_" className="fi-sidebar-group fi-active fi-collapsible">
                    <ul className="fi-sidebar-group-items">
                        {items.map((item) => (
                            <SidebarItem key={item.url} item={item} />
                        ))}
                    </ul>
                </li>
            </ul>
        </div>
    );
}
