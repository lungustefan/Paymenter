import { forbidden, notFound } from 'next/navigation';
import { initRequest, requireUser } from '@/server/page';
import { config } from '@/server/config';
import { currentPath } from '@/server/request';
import { AdminLayout } from '@/admin/layout/AdminLayout';
import { adminRequest, resolveHost, runAdmin } from '@/admin/router';
import { collectNotifications } from '@/admin/Notification';
import { PageNotifications } from '@/admin/layout/client';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<SearchParams> }) {
    const { user } = await initRequest();
    const appName = config('app.name', 'Paymenter');
    if (!user || !(await user.canAccessAdmin())) return { title: appName };
    const segments = (await params).path ?? [];
    const pathname = await currentPath();
    const sp = await searchParams;
    // `mount()` runs again for the page itself: whatever it notifies is shown there
    const title = await runAdmin(await adminRequest(user, pathname, sp), async () => (await collectNotifications(async () => (await resolveHost(segments, user, pathname, sp))?.title)).result);
    return { title: title ? `${title} - ${appName}` : appName };
}

/** Every /admin URL: the panel's pages and resources (what `Filament::registerPanel()` routes to). */
export default async function AdminRoute({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<SearchParams> }) {
    const user = await requireUser();
    // `canAccessPanel`
    if (!(await user.canAccessAdmin())) forbidden();

    const segments = (await params).path ?? [];
    const pathname = await currentPath();
    const sp = await searchParams;

    const { result, notifications } = await runAdmin(await adminRequest(user, pathname, sp), () =>
        collectNotifications(async () => {
            const resolved = await resolveHost(segments, user, pathname, sp);
            if (!resolved) notFound();
            return { content: await resolved.render(), maxContentWidth: resolved.maxContentWidth };
        }),
    );
    return (
        <AdminLayout user={user} path={pathname} maxContentWidth={result.maxContentWidth}>
            {result.content}
            {notifications.length > 0 && <PageNotifications items={notifications} />}
        </AdminLayout>
    );
}
