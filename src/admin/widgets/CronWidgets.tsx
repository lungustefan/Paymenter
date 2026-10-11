import { CronStat as CronStatModel } from '@/server/models/CronStat';
import { Setting } from '@/server/models/Setting';
import { setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { Trend } from '@/server/lib/trend';
import { Stat, StatsOverviewWidget } from './StatsOverviewWidget';
import { ChartWidget } from './ChartWidget';

const ago = (value: string | null | undefined) => (value ? Carbon.parse(value).diffForHumans() : 'Never');

/** App\Admin\Widgets\CronStat\CronOverview */
export class CronOverview extends StatsOverviewWidget {
    static override widgetId = 'cron-overview';
    static override pollingInterval = '60s';

    async getStats() {
        const lastRun = (await Setting.query().where('key', 'last_scheduler_run').first())?.value as string | undefined;
        const lastCronRun = (await Setting.query().where('key', 'last_cron_run').first())?.value as string | undefined;
        const now = Carbon.now();
        const [h, m, s] = String(setting('cronjob_time', '00:00')).split(':').map(Number);
        let nextRun = now.setTime(h || 0, m || 0, s || 0);
        if (nextRun.lte(now)) nextRun = nextRun.addUnit('day', 1);
        return [
            Stat.make('Last scheduler run', ago(lastRun)).extraAttributes({ class: lastRun && Carbon.parse(lastRun).gt(Carbon.now().subMinutes(5)) ? 'success' : 'error' }),
            Stat.make('Last cron run', ago(lastCronRun)).extraAttributes({ class: lastCronRun && Carbon.parse(lastCronRun).gt(Carbon.now().subHours(24)) ? 'success' : 'error' }),
            Stat.make('Next cron run', nextRun.diffForHumans()),
        ];
    }
}

const formatted = (date: string) => Carbon.parse(date).format('M j, Y');

/** App\Admin\Widgets\CronStat\CronStat */
export class CronStat extends StatsOverviewWidget {
    static override widgetId = 'cron-stat';

    protected override getColumns() {
        return 2;
    }

    async getStats() {
        const date: string = this.livewire?.filters?.date ?? Carbon.now().format('Y-m-d');
        const sum = async (key: string) => Number((await CronStatModel.query().where('key', key).where('date', date).sum('value')) ?? 0);
        const on = formatted(date);
        return [
            Stat.make('Invoices Created', await sum('invoices_created')).description(`Total renewal invoices created on ${on}`),
            Stat.make('Services Suspended', await sum('services_suspended')).description(`Total overdue services suspended on ${on}`),
            Stat.make('Services Terminated', await sum('services_terminated')).description(`Total overdue services terminated on ${on}`),
            Stat.make('Tickets Closed', await sum('tickets_closed')).description(`Total inactive tickets closed on ${on}`),
            Stat.make('Invoices Charged', await sum('invoice_charged')).description(`Total invoices charged on ${on}`),
        ];
    }
}

/** App\Admin\Widgets\CronStat\CronTable */
export class CronTable extends ChartWidget {
    static override widgetId = 'cron-table';
    static override columnSpan = 'full' as const;
    static override heading = 'Cron Table';
    static override defaultFilter = 'week';
    static override maxHeight = '300px';

    override getFilters() {
        return { today: 'Today', week: 'Last week', month: 'Last month', year: 'This year' };
    }
    override getType() {
        return 'line';
    }
    override getOptions() {
        return { scales: { y: { beginAtZero: true } } };
    }

    async getData(filter: string | null) {
        const now = Carbon.now();
        const start = { today: () => now.subDay(), week: () => now.subWeek(), month: () => now.subMonth(), year: () => now.subYear() }[(filter ?? 'week') as 'week']();
        const series = (key: string) => Trend.query(CronStatModel.query().where('key', key)).dateColumn('date').between(start, now).perDay().sum('value');
        const [created, suspended, terminated, charged] = await Promise.all([series('invoices_created'), series('services_suspended'), series('services_terminated'), series('invoice_charged')]);
        const dataset = (label: string, values: typeof created, rgb: string) => ({ label, data: values.map((v) => v.aggregate), backgroundColor: `rgba(${rgb}, 0.5)`, borderColor: `rgba(${rgb}, 1)`, borderWidth: 1 });
        return {
            datasets: [dataset('Invoices Created', created, '54, 162, 235'), dataset('Services Suspended', suspended, '255, 206, 86'), dataset('Services Terminated', terminated, '255, 99, 132'), dataset('Invoices Charged', charged, '75, 192, 192')],
            labels: created.map((v) => v.date),
        };
    }
}
