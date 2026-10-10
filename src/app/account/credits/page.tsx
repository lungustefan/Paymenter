import { ThemedPage } from '@/components/ThemedPage';
import { disabledIf, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Add Credits');

/** Port of Livewire\Client\Credits */
export default async function CreditsPage() {
    await requireUser();
    await disabledIf('credits_enabled', false, true);
    return <ThemedPage view="account.credits" sidebar title="Add Credits" />;
}
