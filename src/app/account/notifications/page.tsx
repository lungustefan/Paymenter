import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Notifications');

/** Port of Livewire\Client\Notifications */
export default async function NotificationsPage() {
    await requireUser();
    return <ThemedPage view="account.notifications" sidebar title="Notifications" />;
}
