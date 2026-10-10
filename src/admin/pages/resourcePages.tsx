import type { ReactNode } from 'react';
import type { User } from '@/server/models/User';
import type { Resource } from '../core/Resource';

export interface ResolvedResourcePage {
    resource: typeof Resource;
    pageName: string;
    params: Record<string, string>;
    title: string;
}

export function resolveResourcePage(resource: typeof Resource, rest: string, matchPath: (pattern: string, path: string) => Record<string, string> | null): ResolvedResourcePage | null {
    const pages = resource.getPages();
    for (const [pageName, route] of Object.entries(pages)) {
        const params = matchPath(route.path, rest);
        if (params) return { resource, pageName, params: params, title: `${resource.getPluralModelLabel()}` };
    }
    return null;
}

export async function renderResourcePage(_found: ResolvedResourcePage, _ctx: { user: User; searchParams: Record<string, string | string[] | undefined> }): Promise<ReactNode> {
    return null;
}
