import { ThemedPage } from '@/components/ThemedPage';
import { disabledIf, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { setting } from '@/server/config';
import { Ticket } from '@/server/models/Ticket';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Tickets');

/** Port of Livewire\Tickets\Index */
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    await disabledIf('tickets_disabled');
    const user = await requireUser({ verified: true });
    const page = Math.max(1, Number((await searchParams).page) || 1);
    const tickets = await Ticket.query().where('user_id', user.id).latest().paginate(Number(setting('pagination', 10)), page);
    return <ThemedPage view="tickets.index" sidebar title="Tickets" props={{ tickets }} />;
}
