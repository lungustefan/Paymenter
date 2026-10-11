import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { Hook } from '@/components/Hook';
import { setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import type { Service } from '@/server/models/Service';
import type { Invoice } from '@/server/models/Invoice';
import type { Ticket } from '@/server/models/Ticket';
import { Breadcrumb } from '../components/Breadcrumb';
import { NavLink } from '../components/NavLink';
import { ServicesWidget, InvoicesWidget, TicketsWidget } from './Widgets';

function Count({ n }: { n: number }) {
    return <span className="bg-primary flex items-center justify-center font-semibold rounded-md size-5 text-sm text-white">{n}</span>;
}

/** Port of views/dashboard.blade.php */
export default async function Dashboard({
    counts,
    services,
    invoices,
    tickets,
}: {
    counts: { services: number; tickets: number; invoices: number };
    services: Service[];
    invoices: Invoice[];
    tickets: Ticket[];
}) {
    const t = makeTranslator(await getLocale()).t;
    const linkClass = 'bg-background-secondary hover:bg-background-secondary/80 border border-neutral flex items-center justify-center rounded-lg';
    return (
        <div className="container mt-14">
            <Breadcrumb />
            <p className="text-base text-base/60 font mt-2 mb-8">{t('dashboard.dashboard_description')}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8 items-start">
                <div className="grid gap-8 items-start">
                    {/* Active Services */}
                    <div className="">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-background-secondary border border-neutral p-2 rounded-lg">
                                    <Ri name="archive-stack-fill" className="size-5" />
                                </div>
                                <h2 className="text-xl font-semibold">{t('dashboard.active_services')}</h2>
                            </div>
                            <Count n={counts.services} />
                        </div>
                        <div className="space-y-4">
                            <ServicesWidget services={services} />
                        </div>
                        <NavLink className={linkClass} href={route('services')}>
                            {t('dashboard.view_all')}
                            <Ri name="arrow-right-fill" className="size-5" />
                        </NavLink>
                    </div>

                    {/* Open Tickets */}
                    {!setting('tickets_disabled', false) && (
                        <div className="">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="bg-background-secondary border border-neutral p-2 rounded-lg">
                                        <Ri name="customer-service-fill" className="size-5" />
                                    </div>
                                    <h2 className="text-xl font-semibold">{t('dashboard.open_tickets')}</h2>
                                    <Link href={relativeUrl(route('tickets.create'))}>
                                        <Ri name="add-fill" className="size-5 h-5" />
                                    </Link>
                                </div>
                                <Count n={counts.tickets} />
                            </div>
                            <div className="space-y-4">
                                <TicketsWidget tickets={tickets} />
                            </div>
                            <NavLink className={linkClass} href={route('tickets')}>
                                {t('dashboard.view_all')}
                                <Ri name="arrow-right-fill" className="size-5 h-5" />
                            </NavLink>
                        </div>
                    )}
                </div>

                <div className="grid gap-8 items-start">
                    {/* Unpaid Invoices */}
                    <div className="">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-background-secondary border border-neutral p-2 rounded-lg">
                                    <Ri name="receipt-fill" className="size-5" />
                                </div>
                                <h2 className="text-xl font-semibold">{t('dashboard.unpaid_invoices')}</h2>
                            </div>
                            <Count n={counts.invoices} />
                        </div>
                        <div className="space-y-4">
                            <InvoicesWidget invoices={invoices} />
                        </div>
                        <NavLink className={linkClass} href={route('invoices')}>
                            {t('dashboard.view_all')}
                            <Ri name="arrow-right-fill" className="size-5 h-5" />
                        </NavLink>
                    </div>
                    <Hook name="pages.dashboard" />
                </div>
            </div>
        </div>
    );
}
