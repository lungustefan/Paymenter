import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Account');

/** Port of Livewire\Client\Account */
export default async function AccountPage() {
    await requireUser();
    return <ThemedPage view="account.index" sidebar title="Account" />;
}
