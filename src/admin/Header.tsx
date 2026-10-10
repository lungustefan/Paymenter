import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './ui/Icon';
import { ModalHost } from './actions/client';
import { SidebarItem } from './layout/SidebarItem';
import { Dropdown } from './layout/client';
import type { NavigationItemInfo } from './core/Resource';

export interface Breadcrumb {
    label: string;
    url?: string;
}

/** `<x-filament::breadcrumbs>` */
export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
    return (
        <nav className="fi-breadcrumbs" aria-label="Breadcrumb">
            <ol className="fi-breadcrumbs-list">
                {items.map((item, i) => (
                    <li key={i} className="fi-breadcrumbs-item">
                        {i > 0 && (
                            <>
                                <Icon icon="heroicon-m-chevron-right" className="fi-breadcrumbs-item-separator fi-ltr" aria-hidden="true" />
                                <Icon icon="heroicon-m-chevron-left" className="fi-breadcrumbs-item-separator fi-rtl" aria-hidden="true" />
                            </>
                        )}
                        {item.url ? (
                            <Link href={item.url} className="fi-breadcrumbs-item-label">
                                {item.label}
                            </Link>
                        ) : (
                            <span aria-current={i === items.length - 1 ? 'page' : undefined} className="fi-breadcrumbs-item-label">
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/** `filament-panels::page.header` + the page wrapper */
export function PageFrame({ classes, breadcrumbs, heading, subheading, actions, modalHost = true, subNavigation, children }: { classes: string; breadcrumbs?: Breadcrumb[] | null; heading: ReactNode; subheading?: ReactNode; actions?: ReactNode; modalHost?: boolean; subNavigation?: { label: string; items: NavigationItemInfo[] } | null; children: ReactNode }) {
    const hasCrumbs = !!breadcrumbs && breadcrumbs.length > 0;
    const sub = subNavigation && subNavigation.items.length > 0 ? subNavigation : null;
    return (
        <div className={`fi-page${sub ? ' fi-page-has-sub-navigation fi-page-has-sub-navigation-start' : ''} ${classes}`}>
            <div className="fi-page-header-main-ctn">
                {sub && (
                    <>
                        <div className="fi-page-main-sub-navigation-mobile-menu-render-hook-ctn"></div>
                        <Dropdown
                            className="fi-page-sub-navigation-dropdown"
                            placement="bottom-start"
                            width="xs"
                            trigger={
                                <button className="fi-btn fi-size-md" type="button">
                                    {sub.label}
                                    <Icon icon="heroicon-m-chevron-down" size="md" />
                                </button>
                            }
                        >
                            <div className="fi-dropdown-list">
                                {sub.items.map((i) => (
                                    <Link key={i.url} href={i.url} className="fi-dropdown-list-item" {...(i.isActive ? { 'aria-current': 'page' as const } : {})}>
                                        <Icon icon={i.isActive ? i.activeIcon : i.icon} size="md" className="fi-dropdown-list-item-icon" />
                                        <span className="fi-dropdown-list-item-label">{i.label}</span>
                                    </Link>
                                ))}
                            </div>
                        </Dropdown>
                        <div className="fi-page-main-sub-navigation-mobile-menu-render-hook-ctn"></div>
                    </>
                )}
                <header className={`fi-header${hasCrumbs ? ' fi-header-has-breadcrumbs' : ''}`}>
                    <div>
                        {hasCrumbs && <Breadcrumbs items={breadcrumbs!} />}
                        <h1 className="fi-header-heading">{heading}</h1>
                        {subheading ? <p className="fi-header-subheading">{subheading}</p> : null}
                    </div>
                    {actions ? <div className="fi-header-actions-ctn">{actions}</div> : null}
                </header>
                <div className="fi-page-main">
                    {sub && (
                        <div className="fi-page-sub-navigation-sidebar-ctn">
                            <ul className="fi-page-sub-navigation-sidebar">
                                <li className="fi-sidebar-group fi-active fi-collapsible" data-group-label="sub_navigation_">
                                    <ul className="fi-sidebar-group-items">
                                        {sub.items.map((i) => (
                                            <SidebarItem key={i.url} item={i} />
                                        ))}
                                    </ul>
                                </li>
                            </ul>
                        </div>
                    )}
                    <div className="fi-page-content">{children}</div>
                </div>
            </div>
            {modalHost && <ModalHost />}
        </div>
    );
}
