import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import type { User } from '@/server/models/User';
import { boot } from '@/server/bootstrap';
import './panel';
import { findPage, panelPages, panelResources } from './core/registry';
import { matchPath } from '@/server/extensions/dispatch';
import { renderResourcePage, resolveResourcePage } from './pages/resourcePages';
import { PageFrame } from './Header';

export interface ResolvedRoute {
    title: string;
    render: (ctx: { user: User; searchParams: Record<string, string | string[] | undefined> }) => Promise<ReactNode>;
}

/** `/admin/...` -> a custom page or a resource page. */
export async function resolveAdminRoute(segments: string[]): Promise<ResolvedRoute | null> {
    await boot();
    const path = segments.join('/');

    // custom pages (the dashboard is the page at the root)
    const page = path === '' ? panelPages().find((p) => p.slug === '') : findPage(path);
    if (page) {
        return {
            title: page.getTitle(),
            async render({ user, searchParams }) {
                if (!(await page.canAccess(user))) notFound();
                const instance = new (page as any)();
                instance.user = user;
                instance.searchParams = searchParams;
                await instance.mount();
                const subheading = await instance.getSubheading();
                const heading = page.getTitle();
                return (
                    <PageFrame classes={`fi-${page.slug || 'dashboard'}-page`} breadcrumbs={instance.getBreadcrumbs() ? Object.entries(instance.getBreadcrumbs()).map(([url, label]) => ({ label: String(label), url: url || undefined })) : null} heading={heading} subheading={subheading}>
                        {await instance.render()}
                    </PageFrame>
                );
            },
        };
    }

    // resources: the longest base path that prefixes the URL
    const resource = panelResources()
        .filter((r) => path === r.basePath().slice('/admin/'.length) || path.startsWith(r.basePath().slice('/admin/'.length) + '/'))
        .sort((a, b) => b.basePath().length - a.basePath().length)[0];
    if (resource) {
        const rest = '/' + path.slice(resource.basePath().length - '/admin/'.length).replace(/^\/+/, '');
        const found = resolveResourcePage(resource, rest, matchPath);
        if (found) {
            return {
                title: found.title,
                render: (ctx) => renderResourcePage(found, ctx),
            };
        }
    }
    return null;
}
