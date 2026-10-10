import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { route, relativeUrl } from '@/server/routes';
import { setting } from '@/server/config';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Service } from '@/server/models/Service';
import type { Invoice } from '@/server/models/Invoice';
import type { Ticket } from '@/server/models/Ticket';
import { StatusIcon } from '../components/StatusIcon';
import { Tooltip } from '../components/Tooltip';

/** `__('services.every_period', ...)` suffix for recurring services */
async function everyPeriod(service: Service, tr: ReturnType<typeof makeTranslator>): Promise<string> {
    const plan = (await service.rel('plan'))!;
    if (plan.type !== 'recurring') return '';
    return tr.t('services.every_period', {
        period: (plan.billing_period as number) > 1 ? plan.billing_period : '',
        unit: tr.tChoice(tr.t(`services.billing_cycles.${plan.billing_unit}`), plan.billing_period as number),
    });
}

function serviceStatus(status: string, cancelledAsInactive: boolean) {
    if (status === 'active') return { tone: 'success' as const, icon: 'checkbox-circle-fill' };
    if (status === 'suspended' || (cancelledAsInactive && status === 'cancelled')) return { tone: 'inactive' as const, icon: 'forbid-fill' };
    if (status === 'pending') return { tone: 'warning' as const, icon: 'error-warning-fill' };
    return { tone: 'warning' as const, icon: null };
}

export function invoiceTitle(invoice: Invoice, t: (k: string, r?: Record<string, unknown>) => string): string {
    return !invoice.number && setting('invoice_proforma', false) ? t('invoices.proforma_invoice', { id: invoice.id }) : t('invoices.invoice', { id: invoice.number });
}

/** Port of views/services/widget.blade.php */
export async function ServicesWidget({ services }: { services: Service[] }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(
        services.map(async (service) => {
            const product = (await service.rel('product'))!;
            const category = await product.rel('category');
            return { service, label: await service.displayLabel(), category: category?.name as string, period: await everyPeriod(service, tr) };
        }),
    );
    return (
        <div className="space-y-4">
            {rows.map(({ service, label, category, period }) => {
                const status = serviceStatus(service.status as string, false);
                const renews = service.expires_at ? `- ${tr.t('services.renews_on')}: ${service.expires_at.format('M d, Y')}` : '';
                return (
                    <Link key={service.id} href={relativeUrl(route('services.show', service))}>
                        <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="bg-secondary/10 p-2 rounded-lg">
                                        <Ri name="instance-line" className="size-5 text-secondary" />
                                    </div>
                                    <span className="font-medium">{label}</span>
                                </div>
                                <StatusIcon tone={status.tone} icon={status.icon} />
                            </div>
                            <p className="text-base text-sm">
                                Product(s): {category} {period ? ` - ${period}` : ''} {renews}
                            </p>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

/** Port of views/invoices/widget.blade.php */
export async function InvoicesWidget({ invoices }: { invoices: Invoice[] }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(invoices.map(async (invoice) => ({ invoice, total: String(await invoice.formattedTotal()), items: await invoice.rel('items') })));
    return (
        <div className="space-y-4">
            {rows.map(({ invoice, total, items }) => (
                <Link key={invoice.id} href={relativeUrl(route('invoices.show', invoice))}>
                    <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg mb-4">
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
                            <p key={item.id} className="text-base text-sm text-wrap">
                                Item(s): {item.description} ({tr.t('invoices.invoice_date')}: {invoice.created_at?.format('d M Y')})
                            </p>
                        ))}
                    </div>
                </Link>
            ))}
        </div>
    );
}

export function InvoiceStatus({ status }: { status: string }) {
    if (status === 'paid') return <StatusIcon tone="success" icon="checkbox-circle-fill" />;
    if (status === 'cancelled') return <StatusIcon tone="info" icon="forbid-fill" />;
    if (status === 'pending') return <StatusIcon tone="warning" icon="error-warning-fill" />;
    return <StatusIcon tone="warning" />;
}

export function TicketStatus({ status }: { status: string }) {
    if (status === 'open') return <StatusIcon tone="success" icon="add-circle-fill" />;
    if (status === 'closed') return <StatusIcon tone="inactive" icon="forbid-fill" />;
    if (status === 'replied') return <StatusIcon tone="info" icon="chat-smile-2-fill" />;
    return <StatusIcon tone="info" />;
}

async function lastActivity(ticket: Ticket, tr: ReturnType<typeof makeTranslator>): Promise<string> {
    const last = await ticket.relation('messages').orderBy('created_at', 'desc').first();
    return `${tr.t('ticket.last_activity')} ${last?.created_at?.diffForHumans(null, tr.locale) ?? ''} ${ticket.department ? ' - ' + ticket.department : ''}`;
}

/** Port of views/tickets/widget.blade.php */
export async function TicketsWidget({ tickets }: { tickets: Ticket[] }) {
    const tr = makeTranslator(await getLocale());
    const rows = await Promise.all(tickets.map(async (ticket) => ({ ticket, activity: await lastActivity(ticket, tr) })));
    return (
        <div className="space-y-4">
            {rows.map(({ ticket, activity }) => (
                <Link key={ticket.id} href={relativeUrl(route('tickets.show', ticket))}>
                    <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg mb-4">
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
        </div>
    );
}

export { serviceStatus, everyPeriod, lastActivity, Tooltip };
