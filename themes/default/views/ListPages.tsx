import { Breadcrumb } from '../components/Breadcrumb';
import { NavLink } from '../components/NavLink';
import { Pagination } from '../components/Pagination';
import { Ri } from '@/components/icons/Ri';
import Link from 'next/link';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Paginated } from '@/server/orm';
import type { Service } from '@/server/models/Service';
import type { Invoice } from '@/server/models/Invoice';
import type { Ticket } from '@/server/models/Ticket';
import { Tooltip } from '../components/Tooltip';
import { InvoiceStatus, TicketStatus, everyPeriod, invoiceTitle, lastActivity, serviceStatus } from './Widgets';
import { StatusIcon } from '../components/StatusIcon';

const card = 'bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg mb-4';
const empty = (text: string) => (
    <div className="bg-background-secondary border border-neutral p-4 rounded-lg">
        <p className="text-base text-sm">{text}</p>
    </div>
);

/** Port of views/services/index.blade.php */
export async function ServicesIndex({ services }: { services: Paginated<Service> }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(
        services.data.map(async (service) => {
            const plan = (await service.rel('plan'))!;
            const now = new Date();
            return {
                service,
                label: await service.displayLabel(),
                period: await everyPeriod(service, tr),
                renews: service.expires_at && service.expires_at.valueOf() > now.valueOf() ? { tip: service.expires_at.format('M d, Y'), human: service.expires_at.longAbsoluteDiffForHumans(null, tr.locale) } : null,
                plan,
            };
        }),
    );
    return (
        <div className="container mt-14 space-y-4">
            <Breadcrumb />
            {rows.length === 0 && empty(tr.t('services.no_services'))}
            {rows.map(({ service, label, period, renews }) => {
                const status = serviceStatus(service.status as string, true);
                return (
                    <Link key={service.id} href={relativeUrl(route('services.show', service))}>
                        <div className={card}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="bg-secondary/10 p-2 rounded-lg">
                                        <Ri name="instance-line" className="size-5 text-secondary" />
                                    </div>
                                    <span className="font-medium">{label}</span>
                                </div>
                                <StatusIcon tone={status.tone} icon={status.icon} />
                            </div>
                            <div className="text-base text-sm flex gap-1">
                                {period}{' '}
                                {renews && (
                                    <>
                                        - {tr.t('services.renews_in')}
                                        <Tooltip message={renews.tip}>{renews.human}</Tooltip>
                                    </>
                                )}
                            </div>
                        </div>
                    </Link>
                );
            })}
            <Pagination paginator={services} />
        </div>
    );
}

/** Port of views/invoices/index.blade.php */
export async function InvoicesIndex({ invoices }: { invoices: Paginated<Invoice> }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(invoices.data.map(async (invoice) => ({ invoice, total: String(await invoice.formattedTotal()), items: await invoice.rel('items') })));
    return (
        <div className="container mt-14 space-y-4">
            <Breadcrumb />
            {rows.length === 0 && empty(tr.t('invoices.no_invoices'))}
            {rows.map(({ invoice, total, items }) => (
                <Link key={invoice.id} href={relativeUrl(route('invoices.show', invoice))}>
                    <div className={card}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-secondary/10 p-2 rounded-lg">
                                    <Ri name="bill-line" className="size-5 text-secondary" />
                                </div>
                                <span className="font-medium">{invoiceTitle(invoice, tr.t)}</span>
                                <span className="text-base/50 font-semibold">
                                    <Ri name="circle-fill" className="size-1 text-base/20" />
                                </span>
                                <span className="text-base text-sm">{total}</span>
                            </div>
                            <InvoiceStatus status={invoice.status as string} />
                        </div>
                        {items.map((item) => (
                            <p key={item.id} className="text-base text-sm">
                                Item(s): {item.description} ({tr.t('invoices.invoice_date')}: {invoice.created_at?.format('d M Y')})
                            </p>
                        ))}
                    </div>
                </Link>
            ))}
            <Pagination paginator={invoices} />
        </div>
    );
}

/** Port of views/tickets/index.blade.php */
export async function TicketsIndex({ tickets }: { tickets: Paginated<Ticket> }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(tickets.data.map(async (ticket) => ({ ticket, activity: await lastActivity(ticket, tr) })));
    return (
        <div className="container mt-14 space-y-4">
            <div className="flex flex-row justify-between">
                <Breadcrumb />
                <NavLink href={route('tickets.create')} className="flex items-center gap-2">
                    <Ri name="add-line" className="size-5" />
                    <span>{tr.t('ticket.create_ticket')}</span>
                </NavLink>
            </div>
            {rows.length === 0 && empty(tr.t('ticket.no_tickets'))}
            {rows.map(({ ticket, activity }) => (
                <Link key={ticket.id} href={relativeUrl(route('tickets.show', ticket))}>
                    <div className={card}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <div className="bg-secondary/10 p-2 rounded-lg">
                                    <Ri name="ticket-line" className="size-5 text-secondary" />
                                </div>
                                <span className="font-medium">
                                    #{ticket.id} - {ticket.subject}
                                </span>
                            </div>
                            <TicketStatus status={ticket.status as string} />
                        </div>
                        <p className="text-base text-sm">{activity}</p>
                    </div>
                </Link>
            ))}
            <Pagination paginator={tickets} />
        </div>
    );
}
