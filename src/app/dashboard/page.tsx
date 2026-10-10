import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { setting } from '@/server/config';
import { Invoice } from '@/server/models/Invoice';
import { Service } from '@/server/models/Service';
import { Ticket } from '@/server/models/Ticket';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

/** Port of Livewire\Dashboard (+ the services / invoices / tickets widgets) */
export default async function DashboardPage() {
    const user = await requireUser({ verified: true });
    const perPage = Number(setting('pagination', 10));

    const services = await Service.query().where('user_id', user.id).where('status', 'active').paginate(perPage, 1);
    const invoices = await Invoice.query().where('user_id', user.id).orderBy('id', 'desc').where('status', 'pending').paginate(perPage, 1);
    const tickets = await Ticket.query().where('user_id', user.id).where('status', '!=', 'closed').latest().paginate(perPage, 1);

    return (
        <ThemedPage
            view="dashboard"
            sidebar
            props={{
                counts: { services: services.total, tickets: tickets.total, invoices: invoices.total },
                services: services.data,
                invoices: invoices.data,
                tickets: tickets.data,
            }}
        />
    );
}
