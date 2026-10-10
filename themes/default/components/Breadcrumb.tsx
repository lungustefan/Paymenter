import { Fragment } from 'react';
import { Ri } from '@/components/icons/Ri';
import { Navigation, type NavItem } from '@/server/classes/Navigation';
import { currentPath } from '@/server/request';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';

function pathOf(url: string): string {
    try {
        return new URL(url, 'http://x').pathname.replace(/\/+$/, '') || '/';
    } catch {
        return url;
    }
}

function findBreadcrumb(items: NavItem[], current: string): NavItem[] {
    for (const item of items) {
        if (item.url && pathOf(item.url) === current) return [item];
        if (item.children?.length) {
            const trail = findBreadcrumb(item.children, current);
            if (trail.length) return [item, ...trail];
        }
    }
    return [];
}

/** Port of components/navigation/breadcrumb.blade.php */
export async function Breadcrumb() {
    const current = (await currentPath()).replace(/\/+$/, '') || '/';
    const t = makeTranslator(await getLocale()).t;
    const groups = [await Navigation.getLinks(), await Navigation.getAccountDropdownLinks(), await Navigation.getDashboardLinks()];
    let breadcrumbs: NavItem[] = [];
    for (const group of groups) {
        breadcrumbs = findBreadcrumb(group, current);
        if (breadcrumbs.length) break;
    }

    return (
        <div className="flex flex-row items-center pb-4">
            {breadcrumbs.length > 0 ? (
                breadcrumbs.map((breadcrumb, index) => (
                    <Fragment key={index}>
                        {index > 0 && <Ri name="arrow-right-s-line" className="size-4 text-base mx-2" />}
                        {breadcrumbs.length === 1 ? (
                            <span className="text-2xl font-bold">{breadcrumb.name ?? ''}</span>
                        ) : index === breadcrumbs.length - 1 ? (
                            <span className="text-base/80 font-semibold">{breadcrumb.name ?? ''}</span>
                        ) : (
                            <a href={breadcrumb.route ? relativeUrl(route(breadcrumb.route, breadcrumb.params ?? {})) : '#'} className="text-lg font-bold hover:text-primary">
                                {breadcrumb.name ?? ''}
                            </a>
                        )}
                    </Fragment>
                ))
            ) : (
                <span className="text-lg font-bold">{t('navigation.home')}</span>
            )}
        </div>
    );
}
