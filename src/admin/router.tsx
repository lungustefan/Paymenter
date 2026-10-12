import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import type { User } from '@/server/models/User';
import { boot } from '@/server/bootstrap';
import { syncExtensionAdmin } from './core/extensionAdmin';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import './panel';
import { clusterNavigation, findPage, panelPages, panelResources } from './core/registry';
import { matchPath } from '@/server/extensions/dispatch';
import { PageFrame } from './Header';
import { adminContext, runAdmin } from './context';
import type { Host } from './core/host';
import { AdminPage } from './core/Page';
import { ResourcePage } from './pages/resource/ResourcePage';
import type { PageRoute } from './core/Resource';

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ResolvedHost {
    host: Host;
    /** `<title>` and heading of the page */
    title: string;
    /** `getMaxContentWidth()` of the page (`fi-width-*` of the main container), `null` for the panel default */
    maxContentWidth: string | null;
    /** the whole page (header + content) */
    render: () => Promise<ReactNode>;
}

/** the admin context of a request (current user, translator, URL) */
export async function adminRequest(user: User, pathname: string, searchParams: SearchParams) {
    await syncExtensionAdmin();
    const locale = await getLocale();
    return { user, locale, tr: makeTranslator(locale), pathname, searchParams };
}

/**
 * `/admin/...` -> the page that answers it, created and mounted. Must be called inside `runAdmin`.
 * Returns `null` when no page matches.
 */
export async function resolveHost(segments: string[], user: User, pathname: string, searchParams: SearchParams): Promise<ResolvedHost | null> {
    await boot();
    await syncExtensionAdmin();
    const path = segments.join('/');

    // custom pages (the dashboard is the page at the root)
    const PageClass = path === '' ? panelPages().find((p) => p.slug === '') : findPage(path);
    if (PageClass) {
        if (!(await PageClass.canAccess(user))) notFound();
        const page = new (PageClass as any)() as AdminPage;
        prepare(page, user, pathname, searchParams, {});
        await page.mount();
        const heading = page.getHeading();
        return {
            host: page,
            title: heading,
            maxContentWidth: (PageClass as typeof AdminPage).maxContentWidth,
            async render() {
                const crumbs = page.getBreadcrumbs();
                const cluster = (PageClass as any).cluster;
                const subNavigation = cluster ? { label: cluster.label(), items: await clusterNavigation(cluster, user, pathname) } : null;
                const content = await page.render();
                return (
                    <PageFrame
                        classes={page.getPageClasses().join(' ')}
                        breadcrumbs={crumbs ? Object.entries(crumbs).map(([url, label]) => ({ label: String(label), url: /^\d+$/.test(url) || url === '' ? undefined : url })) : null}
                        heading={heading}
                        subheading={await page.getSubheading()}
                        actions={await page.renderHeaderActions()}
                        modalHost={!adminContext().modalsPlaced}
                        subNavigation={subNavigation}
                    >
                        {content}
                    </PageFrame>
                );
            },
        };
    }

    // resources: the longest base path that prefixes the URL
    const base = (r: { basePath(): string }) => r.basePath().slice('/admin/'.length);
    const resource = panelResources()
        .filter((r) => path === base(r) || path.startsWith(base(r) + '/'))
        .sort((a, b) => b.basePath().length - a.basePath().length)[0];
    if (!resource) return null;

    const rest = '/' + path.slice(base(resource).length).replace(/^\/+/, '');
    for (const route of Object.values(resource.getPages()) as PageRoute[]) {
        const params = matchPath(route.path, rest);
        if (!params) continue;
        const page = new (route.page as any)() as ResourcePage;
        prepare(page, user, pathname, searchParams, params);
        await page.mount();
        const title = page.getTitle();
        return {
            host: page,
            title,
            maxContentWidth: null,
            async render() {
                const content = await page.renderPage();
                const cluster = resource.cluster;
                let subNavigation = cluster ? { label: cluster.label(), items: await clusterNavigation(cluster, user, pathname) } : null;
                if (page.record) {
                    // the links between the pages of one record (`getRecordSubNavigation()`)
                    const items = await resource.getRecordSubNavigation(page);
                    if (items.length) subNavigation = { label: items.find((i) => i.isActive)?.label ?? '', items };
                }
                return (
                    <PageFrame
                        subNavigation={subNavigation}
                        classes={page.getPageClasses().join(' ')}
                        breadcrumbs={await page.getBreadcrumbs()}
                        heading={title}
                        subheading={page.getSubheading()}
                        actions={await page.renderHeaderActions()}
                        modalHost={!adminContext().modalsPlaced}
                    >
                        {content}
                    </PageFrame>
                );
            },
        };
    }
    return null;
}

function prepare(host: Host, user: User, pathname: string, searchParams: SearchParams, params: Record<string, string>) {
    host.user = user;
    host.pathname = pathname;
    host.searchParams = searchParams;
    host.params = params;
}

export { runAdmin };
