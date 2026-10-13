import { Carbon } from './lib/carbon';
import type { TrendInterval } from './lib/trend';

export const InvoiceTransactionStatus = {
    Processing: 'processing',
    Succeeded: 'succeeded',
    Failed: 'failed',
} as const;
export type InvoiceTransactionStatus = (typeof InvoiceTransactionStatus)[keyof typeof InvoiceTransactionStatus];

export const AdjustmentNoteStatus = {
    Active: 'active',
    Voided: 'voided',
} as const;
export type AdjustmentNoteStatus = (typeof AdjustmentNoteStatus)[keyof typeof AdjustmentNoteStatus];

export const AdjustmentNoteType = {
    Credit: 'credit',
    Debit: 'debit',
} as const;
export type AdjustmentNoteType = (typeof AdjustmentNoteType)[keyof typeof AdjustmentNoteType];

export const NotificationEnabledStatus = {
    Force: 'force',
    ChoiceOn: 'choice_on',
    ChoiceOff: 'choice_off',
    Never: 'never',
} as const;
export type NotificationEnabledStatus = (typeof NotificationEnabledStatus)[keyof typeof NotificationEnabledStatus];

/** App\Enums\DashboardPeriod: the periods of the admin dashboard (filter of the revenue chart, window of the overview stats) */
export class DashboardPeriod {
    static readonly Day = new DashboardPeriod('today', 'Last 24 hours', 'hour', 'H:i', (from) => from.subDay());
    static readonly Week = new DashboardPeriod('week', 'Last 7 days', 'day', 'M d', (from) => from.subWeek());
    static readonly Month = new DashboardPeriod('month', 'Last 30 days', 'day', 'M d', (from) => from.subMonth());
    static readonly Year = new DashboardPeriod('year', 'Last 365 days', 'month', 'M', (from) => from.subYear());

    private constructor(
        readonly value: string,
        private readonly text: string,
        private readonly unit: TrendInterval,
        private readonly axisFormat: string,
        private readonly back: (from: Carbon) => Carbon,
    ) {}

    static cases(): DashboardPeriod[] {
        return [this.Day, this.Week, this.Month, this.Year];
    }

    static default(): DashboardPeriod {
        return this.Month;
    }

    /** Resolve a period from user input, falling back to the default for unknown values. */
    static fromValue(value: string | null | undefined): DashboardPeriod {
        return this.cases().find((period) => period.value === String(value ?? '')) ?? this.default();
    }

    static options(): Record<string, string> {
        return Object.fromEntries(this.cases().map((period) => [period.value, period.label()]));
    }

    label(): string {
        return this.text;
    }

    /**
     * Start of this period, counted back from `from` (defaults to now).
     * Passing the start of the current period gives the start of the previous one.
     */
    start(from: Carbon = Carbon.now()): Carbon {
        return this.back(from).startOfDay();
    }

    /** Bucket size of the trend for this period. */
    interval(): TrendInterval {
        return this.unit;
    }

    /** Date format of the chart axis labels. */
    dateFormat(): string {
        return this.axisFormat;
    }
}
