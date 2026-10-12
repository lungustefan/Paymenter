import { redirect } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { loadOwnedService } from '@/server/pages/services';
import { route, relativeUrl } from '@/server/routes';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Upgrade Service');

/** Port of Livewire\Services\Upgrade (mount) */
export default async function UpgradePage({ params }: { params: Promise<{ service: string }> }) {
    await initRequest();
    const { service } = await loadOwnedService((await params).service);
    if (!(await service.upgradable())) {
        // pages cannot set cookies, so the notice goes through the flash route
        redirect(`/flash?m=service-not-upgradable&to=${encodeURIComponent(relativeUrl(route('services.show', service)))}`);
    }
    return <ThemedPage view="services.upgrade" title="Upgrade Service" sidebar props={{ service }} />;
}
