import { ThemedPage } from '@/components/ThemedPage';
import { initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { loadOwnedService, loadServiceActions } from '@/server/pages/services';
import { ExtensionHelper } from '@/server/extensions/helper';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Services');

type Props = { params: Promise<{ service: string }>; searchParams: Promise<{ tab?: string; cancel?: string; label?: string }> };

/** Port of Livewire\Services\Show */
export default async function ServicePage({ params, searchParams }: Props) {
    await initRequest();
    const { service } = await loadOwnedService((await params).service);
    const query = await searchParams;
    const { buttons, views, fields } = await loadServiceActions(service);

    // `#[Url('tab')]`: the selected extension view, defaulting to the first one
    let currentView: string | null = query.tab && views.some((v) => v.name === query.tab) ? query.tab : (views[0]?.name ?? null);
    let extensionView: unknown = null;
    if (currentView) {
        try {
            const viewObj = views.find((v) => v.name === currentView);
            if (!viewObj) throw new Error('View not found');
            extensionView = await ExtensionHelper.getView(service, viewObj as any);
        } catch {
            // fall back to the first view
            currentView = views[0]?.name ?? null;
        }
    }

    return (
        <ThemedPage
            view="services.show"
            title="Services"
            sidebar
            props={{ service, buttons, views, fields, currentView, extensionView, showCancel: ['1', 'true'].includes(query.cancel ?? ''), editLabel: ['1', 'true'].includes(query.label ?? '') }}
        />
    );
}
