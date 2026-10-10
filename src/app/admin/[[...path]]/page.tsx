import { notFound } from 'next/navigation';
import { initRequest, requireUser } from '@/server/page';
import { config } from '@/server/config';
import { currentPath } from '@/server/request';
import { AdminLayout } from '@/admin/layout/AdminLayout';
import { resolveAdminRoute } from '@/admin/router';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }) {
    await initRequest();
    const resolved = await resolveAdminRoute((await params).path ?? []);
    const title = resolved?.title;
    return { title: title ? `${title} - ${config('app.name', 'Paymenter')}` : config('app.name', 'Paymenter') };
}

/** Every /admin URL: the panel's pages and resources (what `Filament::registerPanel()` routes to). */
export default async function AdminRoute({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const user = await requireUser();
    // `canAccessPanel`
    if (!(await user.canAccessAdmin())) notFound();

    const segments = (await params).path ?? [];
    const resolved = await resolveAdminRoute(segments);
    if (!resolved) notFound();

    const content = await resolved.render({ user, searchParams: await searchParams });
    return <AdminLayout user={user} path={await currentPath()}>{content}</AdminLayout>;
}
