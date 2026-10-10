import { notFound } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { initRequest, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { ExtensionHelper } from '@/server/extensions/helper';
import { matchPath } from '@/server/extensions/dispatch';

export const dynamic = 'force-dynamic';

/** The pages (client area routes) contributed by extensions, e.g. `/announcements`. */
async function findPage(slug: string[]) {
    await initRequest();
    const path = '/' + slug.map(decodeURIComponent).join('/');
    for (const page of ExtensionHelper.pages) {
        const params = matchPath(page.path, path, page.where);
        if (params) return { page, params };
    }
    return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
    const found = await findPage((await params).slug);
    return pageMeta(found?.page.title);
}

export default async function ExtensionPageRoute({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const found = await findPage((await params).slug);
    if (!found) notFound();

    const { page, params: routeParams } = found;
    const user = page.auth ? await requireUser() : (await initRequest()).user;
    const content = await page.render({ params: routeParams, searchParams: await searchParams, user });

    return (
        <ThemedPage title={page.title} sidebar={page.sidebar}>
            {content}
        </ThemedPage>
    );
}
