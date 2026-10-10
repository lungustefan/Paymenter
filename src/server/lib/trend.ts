import { sql } from 'drizzle-orm';
import type { Builder } from '@/server/orm';
import { Carbon } from './carbon';

export type TrendInterval = 'minute' | 'hour' | 'day' | 'month' | 'year';

export interface TrendValue {
    date: string;
    aggregate: number | string;
}

/** `Flowframe\Trend\Trend`: an aggregate per period between two dates, with the empty periods filled in */
export class Trend {
    private startDate!: Carbon;
    private endDate!: Carbon;
    private unit: TrendInterval = 'day';

    private constructor(
        private readonly builder: Builder<any>,
        private dateColumnName = 'created_at',
    ) {}

    /** `dateColumn('date')` */
    dateColumn(name: string) {
        this.dateColumnName = name;
        return this;
    }
    private get dateCol() {
        return this.dateColumnName;
    }

    static query(builder: Builder<any>) {
        return new Trend(builder);
    }

    static model(model: { query(): Builder<any> }) {
        return new Trend(model.query());
    }

    between(start: Carbon, end: Carbon) {
        this.startDate = start;
        this.endDate = end;
        return this;
    }
    interval(unit: TrendInterval) {
        this.unit = unit;
        return this;
    }
    perMinute() {
        return this.interval('minute');
    }
    perHour() {
        return this.interval('hour');
    }
    perDay() {
        return this.interval('day');
    }
    perMonth() {
        return this.interval('month');
    }
    perYear() {
        return this.interval('year');
    }

    sum(column: string) {
        return this.aggregate(column, 'sum');
    }
    count(column = '*') {
        return this.aggregate(column, 'count');
    }
    average(column: string) {
        return this.aggregate(column, 'avg');
    }

    private get sqlFormat() {
        return { minute: '%Y-%m-%d %H:%i:00', hour: '%Y-%m-%d %H:00', day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' }[this.unit];
    }

    private get carbonFormat() {
        return { minute: 'Y-m-d H:i:00', hour: 'Y-m-d H:00', day: 'Y-m-d', month: 'Y-m', year: 'Y' }[this.unit];
    }

    async aggregate(column: string, aggregate: 'sum' | 'count' | 'avg'): Promise<TrendValue[]> {
        const date = sql`date_format(${sql.identifier(this.dateCol)}, ${this.sqlFormat})`;
        const query = this.builder.clone().whereBetween(this.dateCol, [this.startDate.toDateTimeString(), this.endDate.toDateTimeString()]);
        const rows = await query.aggregateByDate(date, sql`${sql.raw(aggregate)}(${sql.raw(column)})`);
        const byDate = new Map<string, TrendValue>();
        for (const row of rows) byDate.set(String(row.date), { date: String(row.date), aggregate: row.aggregate });

        // `CarbonPeriod::between($start, $end)->interval("1 $unit")`: the periods without rows count as 0
        for (let cursor = this.startDate; cursor.date.getTime() <= this.endDate.date.getTime(); cursor = cursor.addUnit(this.unit, 1)) {
            const key = cursor.format(this.carbonFormat);
            if (!byDate.has(key)) byDate.set(key, { date: key, aggregate: 0 });
        }
        return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
}
