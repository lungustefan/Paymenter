import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './ui/Icon';

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
export function PageFrame({ classes, breadcrumbs, heading, subheading, actions, children }: { classes: string; breadcrumbs?: Breadcrumb[] | null; heading: ReactNode; subheading?: ReactNode; actions?: ReactNode; children: ReactNode }) {
    const hasCrumbs = !!breadcrumbs && breadcrumbs.length > 0;
    return (
        <div className={`fi-page ${classes}`}>
            <div className="fi-page-header-main-ctn">
                <header className={`fi-header${hasCrumbs ? ' fi-header-has-breadcrumbs' : ''}`}>
                    <div>
                        {hasCrumbs && <Breadcrumbs items={breadcrumbs!} />}
                        <h1 className="fi-header-heading">{heading}</h1>
                        {subheading ? <p className="fi-header-subheading">{subheading}</p> : null}
                    </div>
                    {actions ? <div className="fi-header-actions-ctn">{actions}</div> : null}
                </header>
                <div className="fi-page-main">
                    <div className="fi-page-content">{children}</div>
                </div>
            </div>
        </div>
    );
}
