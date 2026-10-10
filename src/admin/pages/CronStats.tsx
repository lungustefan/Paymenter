import { AdminPage } from '../core/Page';
import { Action } from '../actions/Action';
import { Schema, DatePicker } from '../forms';
import { renderWidgets } from '../widgets/Widget';
import { CronOverview, CronStat, CronTable } from '../widgets/CronWidgets';
import { hasPermission } from '@/server/policies';
import { Carbon } from '@/server/lib/carbon';
import type { User } from '@/server/models/User';

/** App\Admin\Pages\CronStats (a Dashboard with a date filter) */
export class CronStats extends AdminPage {
    static slug = 'cron-stats';
    static title = 'Cron Statistics';
    static navigationGroup = 'System';
    static navigationIcon = 'ri-time-line';
    static activeNavigationIcon = 'ri-time-fill';
    static navigationSort = 4;

    static override async canAccess(user: User | null) {
        return !!user && (await hasPermission(user, 'admin.cron_stats.view'));
    }

    /** `$filters` of the page: the date lives in the URL */
    get filters() {
        const date = this.searchParams.date;
        return { date: (Array.isArray(date) ? date[0] : date) || Carbon.now().format('Y-m-d') };
    }

    override getHeaderActions() {
        return [
            Action.make('filter')
                .label('Filter')
                .icon('heroicon-m-funnel').iconSize('md')
                .color('gray')
                .form(() => Schema.make().components([DatePicker.make('date').default(() => Carbon.now().format('Y-m-d')).label('Select Date').required()]))
                .fillForm(() => this.filters)
                .modalSubmitActionLabel('Apply')
                .action(({ data }: any) => ({ date: String(data.date).slice(0, 10) }))
                .successRedirectUrl(({ result }: any) => `/admin/cron-stats?date=${result.date}`),
        ];
    }

    override getWidgetClasses() {
        return [CronOverview, CronTable, CronStat];
    }

    render() {
        return renderWidgets([CronOverview, CronTable, CronStat], { user: this.user, livewire: this }, 2);
    }
}
