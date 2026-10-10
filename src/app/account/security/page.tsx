import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Security');

/** Port of Livewire\Client\Security */
export default async function SecurityPage() {
    await requireUser();
    return <ThemedPage view="account.security" sidebar title="Security" />;
}
