import { notFound } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { disabledIf, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { Ticket } from '@/server/models/Ticket';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

/** Port of Livewire\Tickets\Show */
export default async function TicketPage({ params }: { params: Promise<{ ticket: string }> }) {
    await disabledIf('tickets_disabled');
    const user = await requireUser({ verified: true });
    const id = (await params).ticket;
    if (!/^\d+$/.test(id)) notFound();
    const ticket = await Ticket.find<Ticket>(Number(id));
    if (!ticket || ticket.user_id !== user.id) notFound();
    return <ThemedPage view="tickets.show" sidebar props={{ ticket }} />;
}
