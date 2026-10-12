import { once } from '@/server/request-store';
import { currentPath } from '@/server/request';
import { setting } from '@/server/config';
import { EventHelper } from '@/server/helpers/EventHelper';
import { route } from '@/server/routes';
import { getCurrentUser } from '@/server/auth/session';
import { Category } from '@/server/models/Category';
import { sessionGet } from '@/server/session';
import { makeTranslator } from '@/server/i18n';
import { config } from '@/server/config';

export interface NavItem {
    name: string;
    url?: string;
    route?: string;
    params?: Record<string, unknown>;
    icon?: string;
    children?: NavItem[];
    condition?: boolean;
    separator?: boolean;
    priority?: number;
    spa?: boolean;
    active?: boolean;
    [key: string]: unknown;
}

async function tr() {
    return makeTranslator(await sessionGet<string>('locale', config('app.locale', 'en')));
}

/** `request()->livewireUrl()` reduced to a path: where the user currently is. */
async function currentUrlPath(): Promise<string> {
    return (await currentPath()).replace(/\/+$/, '') || '/';
}

function pathOf(url: string): string {
    try {
        const p = new URL(url, 'http://localhost').pathname.replace(/\/+$/, '');
        return p || '/';
    } catch {
        return url;
    }
}

/** Port of App\Classes\Navigation */
export class Navigation {
    static getLinks(): Promise<NavItem[]> {
        return once('nav:links', async () => {
            const { t } = await tr();
            const categories = await Category.query()
                .whereNull('parent_id')
                .where((q) => {
                    q.whereHas('children').orWhereHas('products', (pq) => {
                        pq.where('hidden', false);
                    });
                })
                .orderBy('sort')
                .get();

            let routes: NavItem[] = [
                {
                    name: t('navigation.home'),
                    url: route('home'),
                    icon: 'ri-home-2',
                },
                {
                    name: t('navigation.shop'),
                    children: categories.map((category) => ({
                        name: category.name as string,
                        url: route('category.show', { category: category.slug }),
                    })),
                    condition: categories.length > 0,
                    separator: true,
                    icon: 'ri-shopping-bag',
                },
            ];

            routes = await EventHelper.itemEvent('navigation', routes);
            routes = routes.filter((r) => (r.condition === undefined ? true : !!r.condition));
            return Navigation.markActiveRoute(routes);
        });
    }

    /** Navigation items for the user dropdown menu */
    static getAccountDropdownLinks(): Promise<NavItem[]> {
        return once('nav:account-dropdown', async () => {
            const { t } = await tr();
            const user = await getCurrentUser();

            let routes: NavItem[] = [
                { name: t('navigation.dashboard'), url: route('dashboard') },
                { name: t('navigation.tickets'), url: route('tickets'), condition: !setting('tickets_disabled', false) },
                { name: t('navigation.account'), url: route('account') },
                {
                    name: t('navigation.admin'),
                    url: route('filament.admin.pages.dashboard'),
                    spa: false,
                    condition: !!user && user.role_id !== null && user.role_id !== undefined,
                },
            ];

            routes = await EventHelper.itemEvent('navigation.account-dropdown', routes);
            routes = routes.filter((r) => (r.condition === undefined ? true : !!r.condition));
            return Navigation.markActiveRoute(routes);
        });
    }

    static getDashboardLinks(): Promise<NavItem[]> {
        return once('nav:dashboard', async () => {
            const { t } = await tr();
            const auth = !!(await getCurrentUser());

            const accountChildren = await EventHelper.itemEvent<NavItem>('navigation.account', [
                { name: t('navigation.personal_details'), url: route('account'), params: {}, priority: 10 },
                { name: t('navigation.security'), url: route('account.security'), params: {}, priority: 20 },
                { name: t('account.credits'), url: route('account.credits'), params: {}, condition: !!setting('credits_enabled'), priority: 30 },
                { name: t('account.payment_methods'), url: route('account.payment-methods'), priority: 40 },
                { name: t('navigation.notifications'), url: route('account.notifications'), priority: 50 },
            ]);

            let routes: NavItem[] = [
                { name: t('navigation.dashboard'), url: route('dashboard'), icon: 'ri-function', condition: auth, priority: 10 },
                { name: t('navigation.services'), url: route('services'), icon: 'ri-archive-stack', condition: auth, priority: 20 },
                { name: t('navigation.invoices'), url: route('invoices'), icon: 'ri-receipt', separator: true, condition: auth, priority: 30 },
                {
                    name: t('navigation.tickets'),
                    url: route('tickets'),
                    icon: 'ri-customer-service',
                    separator: true,
                    condition: auth && !setting('tickets_disabled', false),
                    priority: 40,
                },
                { name: t('navigation.account'), icon: 'ri-settings-3', condition: auth, priority: 50, children: accountChildren },
            ];

            routes = await EventHelper.itemEvent('navigation.dashboard', routes);
            routes = routes.filter((r) => (r.condition === undefined ? true : !!r.condition));
            return Navigation.markActiveRoute(routes);
        });
    }

    /**
     * Set `active` on every item (true when it points at the current page), make
     * route names into URLs and give icons the `-fill` / `-line` suffix.
     */
    static async markActiveRoute(routes: NavItem[]): Promise<NavItem[]> {
        const current = await currentUrlPath();

        const isActive = (item: NavItem): boolean => {
            if (item.url && pathOf(item.url) === current) return true;
            if (item.children?.length) return item.children.some((c) => c.url && pathOf(c.url) === current);
            return false;
        };

        return routes.map((r) => {
            const item: NavItem = { ...r };
            if (item.route && !item.url) item.url = route(item.route, item.params ?? {});

            if (item.children) {
                item.children = item.children.map((c) => {
                    const child: NavItem = { ...c };
                    if (child.route && !child.url) child.url = route(child.route, child.params ?? {});
                    child.active = isActive(child);
                    if (child.icon) child.icon += child.active ? '-fill' : '-line';
                    return child;
                });
            }

            item.active = isActive(item);
            if (item.icon) item.icon += item.active ? '-fill' : '-line';
            return item;
        });
    }
}
