import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { Order } from '@/server/models/Order';
import { Service } from '@/server/models/Service';
import { Ticket } from '@/server/models/Ticket';
import { UserSession } from '@/server/models/UserSession';
import { InvoiceTransactionStatus } from '@/server/enums';
import { sql } from 'drizzle-orm';
import { Carbon } from '@/server/lib/carbon';
import { Trend } from '@/server/lib/trend';
import { numberFormat } from '@/server/lib/php';
import type { User } from '@/server/models/User';
import { Widget } from './Widget';
import { Stat, StatsOverviewWidget } from './StatsOverviewWidget';
import { ChartWidget } from './ChartWidget';
import { TableWidget } from './TableWidget';
import { CopyText } from './client';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { TicketResource } from '../resources/TicketResource';
import { UserResource } from '../resources/UserResource';

const sumOf = (values: Array<{ aggregate: number | string }>) => values.reduce((total, v) => total + Number(v.aggregate), 0);

/** the description of a stat compared with the 30 days before */
function change(thisMonth: number, lastMonth: number) {
    const increase = thisMonth - lastMonth;
    const percentage = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
    return {
        description: `${increase >= 0 ? 'Increased' : 'Decreased'} by ${numberFormat(percentage, 2)}% (last 30 days)`,
        icon: increase >= 0 ? 'heroicon-m-arrow-trending-up' : 'heroicon-m-arrow-trending-down',
        color: (increase >= 0 ? 'success' : 'danger') as 'success' | 'danger',
    };
}

/** App\Admin\Widgets\Overview */
export class Overview extends StatsOverviewWidget {
    static override widgetId = 'overview';
    // Poll every 5 minutes (5m doesn't work somehow)
    static override pollingInterval = '600s';

    static override canView(user: User) {
        return user.hasPermission('admin.widgets.overview');
    }

    async getStats() {
        return [await this.invoiceTransaction(), await this.getData(Ticket, 'Tickets'), await this.getData(Service, 'Services')];
    }

    private async invoiceTransaction() {
        const chart = await Trend.query(InvoiceTransaction.query().where('status', InvoiceTransactionStatus.Succeeded).where('is_credit_transaction', false))
            .between(Carbon.now().subMonth().startOfDay(), Carbon.now())
            .perDay()
            .sum('amount');
        const thisMonth = sumOf(chart);
        const lastMonth = await InvoiceTransaction.query().whereBetween('created_at', [Carbon.now().subMonths(2).startOfDay().toDateTimeString(), Carbon.now().subMonth().endOfDay().toDateTimeString()]).sum('amount');
        const c = change(thisMonth, lastMonth);
        return Stat.make('Revenue', thisMonth)
            .description(c.description)
            .descriptionIcon(c.icon)
            .chart(chart.map((v) => v.aggregate))
            .color(c.color);
    }

    private async getData(model: any, name: string) {
        const chart = await Trend.model(model)
            .between(Carbon.now().subMonth().startOfDay(), Carbon.now())
            .perDay()
            .count();
        const thisMonth = sumOf(chart);
        const lastMonth = await model.query().whereBetween('created_at', [Carbon.now().subMonths(2).startOfDay().toDateTimeString(), Carbon.now().subMonth().endOfDay().toDateTimeString()]).count();
        const c = change(thisMonth, lastMonth);
        return Stat.make(name, thisMonth)
            .description(c.description)
            .descriptionIcon(c.icon)
            .chart(chart.map((v) => v.aggregate))
            .color(c.color);
    }
}

/** App\Admin\Widgets\Revenue */
export class Revenue extends ChartWidget {
    static override widgetId = 'revenue';
    static override heading = 'Revenue';
    static override defaultFilter = 'week';

    static override canView(user: User) {
        return user.hasPermission('admin.widgets.revenue');
    }

    override getFilters() {
        return { today: 'Last 24 hours', week: 'Last 7 days', month: 'Last 30 days', year: 'Last 365 days' };
    }

    async getData(filter: string | null) {
        const f = (filter ?? 'week') as 'today' | 'week' | 'month' | 'year';
        const start = { today: () => Carbon.now().subDay().startOfDay(), week: () => Carbon.now().subWeek().startOfDay(), month: () => Carbon.now().subMonth().startOfDay(), year: () => Carbon.now().subYear().startOfDay() }[f]();
        const end = Carbon.now();
        const per = { today: 'hour', week: 'day', month: 'day', year: 'month' }[f] as 'hour' | 'day' | 'month';
        const succeeded = () => InvoiceTransaction.query().where('status', InvoiceTransactionStatus.Succeeded).where('is_credit_transaction', false);
        const trend = (t: Trend) => t.between(start, end).interval(per);

        const revenue = await trend(Trend.query(succeeded())).sum('amount');
        const netRevenue = await trend(Trend.query(succeeded())).sum('amount - COALESCE(fee, 0)');
        const newOrders = await trend(Trend.model(Order)).count();

        return {
            datasets: [
                { label: 'Revenue', data: revenue.map((v) => v.aggregate), backgroundColor: '#3490dc', borderColor: '#3490dc' },
                { label: 'Net Revenue', data: netRevenue.map((v) => v.aggregate), backgroundColor: '#38c172', borderColor: '#38c172' },
                { label: 'New Orders', data: newOrders.map((v) => v.aggregate), backgroundColor: '#e3342f', borderColor: '#e3342f' },
            ],
            labels: revenue.map((v) => {
                const date = Carbon.parse(f === 'year' ? `${v.date}-01` : v.date);
                return f === 'today' ? date.format('H:i') : f === 'year' ? date.format('M') : date.format('M d');
            }),
        };
    }

    override getType() {
        return 'line';
    }

    override getOptions() {
        return { scales: { y: { beginAtZero: true } } };
    }
}

/** App\Admin\Widgets\Support */
export class Support extends TableWidget {
    static override widgetId = 'support';
    static override pollingInterval = '30s';
    static override model = Ticket;

    static override canView(user: User) {
        return user.hasPermission('admin.widgets.support');
    }

    override table(table: Table) {
        return table
            .queryFrom(() => Ticket.query().where('status', '!=', 'closed').with('user').orderByRaw(sql`(select max(created_at) from ticket_messages where ticket_id = tickets.id) desc`).limit(5))
            .columns([
                TextColumn.make('subject').label('Subject'),
                TextColumn.make('status')
                    .label('Status')
                    .badge()
                    .color(({ record }) => ({ open: 'success', closed: 'danger', replied: 'warning' })[(record as Ticket).status as string] ?? null)
                    .formatStateUsing(({ state }) => String(state).charAt(0).toUpperCase() + String(state).slice(1)),
                TextColumn.make('user.name').label('User'),
                TextColumn.make('created_at').label('Created At'),
            ])
            .recordUrl((record: any) => TicketResource.getUrl('edit', { record }))
            .paginated(false);
    }
}

/** App\Admin\Widgets\ActiveUsers */
export class ActiveUsers extends Widget {
    static override widgetId = 'active-users';
    static override sort = 2;

    static override canView(user: User) {
        return user.hasPermission('admin.widgets.active_users');
    }

    override async render() {
        const base = () => UserSession.query().where('last_activity', '>=', Carbon.now().subMinutes(60)).whereNotNull('user_id').orderBy('last_activity', 'desc').with('user');
        const sessions = await base().limit(5).get();
        const onlineCount = await base().count();
        return this.root(
            null,
            <section className="fi-section fi-section-has-header">
                <header className="fi-section-header">
                    <div className="fi-section-header-text-ctn">
                        <h2 className="fi-section-header-heading">{`Active Users (${onlineCount})`}</h2>
                    </div>
                </header>
                <div className="fi-section-content-ctn">
                    <div className="fi-section-content">
                        {await Promise.all(
                            sessions.map(async (session: any) => {
                                const user = await session.rel('user');
                                if (!user) return null;
                                return (
                                    <div key={session.id} className="flex flex-row justify-between w-full items-center space-x-4">
                                        <a href={UserResource.getUrl('edit', { record: user })} className="flex-grow">
                                            <div>
                                                <h2 className="font-bold">{user.displayName()}</h2>
                                                <div className="text-sm mb-2">{user.email}</div>
                                            </div>
                                        </a>
                                        <div className="text-right min-w-[140px]">
                                            <p className="text-sm text-base">{session.last_activity.diffForHumans()}</p>
                                            <CopyText text={session.ip_address} className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-primary-500 transition-colors select-none" />
                                        </div>
                                    </div>
                                );
                            }),
                        )}
                    </div>
                </div>
            </section>,
        );
    }
}

/** App\Admin\Resources\TicketResource\Widgets\TicketsOverView */
export class TicketsOverView extends StatsOverviewWidget {
    static override widgetId = 'tickets-overview';
    static override pollingInterval = '20s';

    async getStats() {
        return [
            Stat.make('Open Tickets', await Ticket.query().where('status', 'open').count()).color('success'),
            Stat.make('Closed Tickets', await Ticket.query().where('status', 'closed').count()).color('danger'),
            Stat.make('Replied Tickets', await Ticket.query().where('status', 'replied').count()).color('gray'),
        ];
    }
}
