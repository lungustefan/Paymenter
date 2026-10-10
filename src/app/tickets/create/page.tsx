import { ThemedPage } from '@/components/ThemedPage';
import { disabledIf, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Create Ticket');

/** Port of Livewire\Tickets\Create */
export default async function CreateTicketPage() {
    await disabledIf('tickets_disabled');
    await requireUser({ verified: true });
    return <ThemedPage view="tickets.create" title="Create Ticket" sidebar />;
}
