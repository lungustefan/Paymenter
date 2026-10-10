import type { User } from '@/server/models/User';
import { AdminPage } from './Page';
import { Cluster, Resource, type NavigationItemInfo } from './Resource';

/**
 * Everything the panel discovers: pages, clusters and resources (the PHP release scans the
 * `app/Admin` folders and the `Admin` folders of the enabled extensions).
 */
export interface PanelRegistry {
    pages: Array<typeof AdminPage>;
    clusters: Array<typeof Cluster>;
    resources: Array<typeof Resource>;
    widgets: any[];
}

const registry: PanelRegistry = { pages: [], clusters: [], resources: [], widgets: [] };
/** what extensions contributed (replaced when extensions are booted again) */
const fromExtensions = new Map<string, Partial<PanelRegistry>>();

/** two registrations of the same thing (a hot reloaded module re-registers itself): same kind of entry, same URL */
const sameEntry = (a: any, b: any) => a === b || (a.slug !== undefined && a.slug === b.slug && (a.cluster?.slug ?? null) === (b.cluster?.slug ?? null));

function upsert(list: any[], entry: any) {
    const index = list.findIndex((e) => sameEntry(e, entry));
    if (index === -1) list.push(entry);
    else list[index] = entry;
}

export function registerCore(entries: Partial<PanelRegistry>) {
    for (const key of ['pages', 'clusters', 'resources', 'widgets'] as const) {
        for (const e of entries[key] ?? []) upsert(registry[key] as any[], e);
    }
}

export function registerExtensionAdmin(extension: string, entries: Partial<PanelRegistry>) {
    fromExtensions.set(extension, entries);
}

export function forgetExtensionAdmin(extension: string) {
    fromExtensions.delete(extension);
}

function all<K extends keyof PanelRegistry>(key: K): PanelRegistry[K] {
    const out = [...registry[key]] as any[];
    for (const e of fromExtensions.values()) for (const x of (e[key] ?? []) as any[]) if (!out.includes(x)) out.push(x);
    return out as PanelRegistry[K];
}

export const panelPages = () => all('pages');
export const panelClusters = () => all('clusters');
export const panelResources = () => all('resources');

export function findResource(slugPath: string): typeof Resource | undefined {
    return panelResources().find((r) => `${r.cluster ? r.cluster.slug + '/' : ''}${r.getSlug()}` === slugPath);
}

export function findPage(slugPath: string): typeof AdminPage | undefined {
    return panelPages().find((p) => `${p.cluster ? p.cluster.slug + '/' : ''}${p.slug}` === slugPath);
}

/** the groups of the sidebar, in the order of the panel's `navigationGroups()` */
export const NAVIGATION_GROUPS = ['Administration', 'Configuration', 'Extensions', 'System'];

export interface NavigationGroup {
    label: string | null;
    items: NavigationItemInfo[];
}

/** the pages / resources whose `shouldRegisterNavigation()` is true */
async function navigable<T extends { shouldRegisterNavigation(): boolean | Promise<boolean> }>(list: T[]): Promise<T[]> {
    const out: T[] = [];
    for (const item of list) if (await item.shouldRegisterNavigation()) out.push(item);
    return out;
}

/** Items of a cluster's sub navigation (the resources and pages inside it). */
export async function clusterNavigation(cluster: typeof Cluster, user: User | null, currentPath: string): Promise<NavigationItemInfo[]> {
    const items: NavigationItemInfo[] = [];
    for (const page of await navigable(panelPages().filter((p) => p.cluster === cluster))) {
        if (!(await page.canAccess(user))) continue;
        items.push({ label: page.getNavigationLabel(), url: page.getUrl(), icon: page.navigationIcon, activeIcon: page.activeNavigationIcon ?? page.navigationIcon, group: null, sort: page.navigationSort, isActive: currentPath === page.getUrl() || currentPath.startsWith(page.getUrl() + '/'), cluster: cluster.slug });
    }
    for (const resource of await navigable(panelResources().filter((r) => r.cluster === cluster))) {
        if (!(await resource.canAccess(user))) continue;
        const base = resource.basePath();
        items.push({
            label: resource.getNavigationLabel(),
            url: resource.getUrl('index'),
            icon: resource.navigationIcon,
            activeIcon: resource.activeNavigationIcon ?? resource.navigationIcon,
            group: null,
            sort: resource.navigationSort,
            badge: (await resource.getNavigationBadge()) ?? null,
            badgeColor: resource.getNavigationBadgeColor(),
            isActive: currentPath === base || currentPath.startsWith(base + '/'),
            cluster: cluster.slug,
        });
    }
    return stableSort(items);
}

const stableSort = <T extends { sort: number | null }>(items: T[]): T[] => items.map((item, i) => ({ item, i })).sort((a, b) => (a.item.sort ?? -1) - (b.item.sort ?? -1) || a.i - b.i).map((x) => x.item);

/** `Filament::getNavigation()` */
export async function buildNavigation(user: User | null, currentPath: string): Promise<NavigationGroup[]> {
    const entries: NavigationItemInfo[] = [];

    // pages, then clusters, then resources (the order Filament registers them in)
    for (const page of await navigable(panelPages().filter((p) => !p.cluster))) {
        if (!(await page.canAccess(user))) continue;
        entries.push({
            label: page.getNavigationLabel(),
            url: page.getUrl(),
            icon: page.navigationIcon,
            activeIcon: page.activeNavigationIcon ?? page.navigationIcon,
            group: page.navigationGroup,
            sort: page.navigationSort,
            isActive: currentPath === page.getUrl() || (page.getUrl() !== '/admin' && currentPath.startsWith(page.getUrl() + '/')),
        });
    }
    for (const cluster of panelClusters()) {
        const subs = await clusterNavigation(cluster, user, currentPath);
        if (subs.length === 0) continue;
        entries.push({
            label: cluster.label(),
            url: subs[0].url,
            icon: cluster.navigationIcon,
            activeIcon: cluster.activeNavigationIcon ?? cluster.navigationIcon,
            group: cluster.navigationGroup,
            sort: cluster.navigationSort,
            badge: (await cluster.getNavigationBadge()) ?? null,
            badgeColor: cluster.getNavigationBadgeColor(),
            isActive: currentPath === `/admin/${cluster.slug}` || currentPath.startsWith(`/admin/${cluster.slug}/`),
        });
    }
    for (const resource of await navigable(panelResources().filter((r) => !r.cluster))) {
        if (!(await resource.canAccess(user))) continue;
        const base = resource.basePath();
        entries.push({
            label: resource.getNavigationLabel(),
            url: resource.getUrl('index'),
            icon: resource.navigationIcon,
            activeIcon: resource.activeNavigationIcon ?? resource.navigationIcon,
            group: resource.navigationGroup,
            sort: resource.navigationSort,
            badge: (await resource.getNavigationBadge()) ?? null,
            badgeColor: resource.getNavigationBadgeColor(),
            isActive: currentPath === base || currentPath.startsWith(base + '/'),
        });
    }

    // ungrouped first, then the configured groups, then any other group in registration order
    const labels: Array<string | null> = [null, ...NAVIGATION_GROUPS];
    for (const e of entries) if (e.group && !labels.includes(e.group)) labels.push(e.group);
    return labels
        .map((label) => ({ label, items: stableSort(entries.filter((e) => (e.group ?? null) === label)) }))
        .filter((g) => g.items.length > 0);
}
