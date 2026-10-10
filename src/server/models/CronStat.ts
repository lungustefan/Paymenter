import { Model } from '@/server/orm';
import { cronStats } from '@/server/db/schema';
import type { Row } from './_types';

export interface CronStat extends Row<typeof cronStats> {}

export class CronStat extends Model {
    static table = cronStats;
    static morphName = 'App\\Models\\CronStat';
    static fillable = ['key', 'value', 'date'];
    static casts = { date: 'date' };
}
