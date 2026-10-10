import { Model } from '@/server/orm';
import { debugLogs } from '@/server/db/schema';
import type { Row } from './_types';

export interface DebugLog extends Row<typeof debugLogs> {}

export class DebugLog extends Model {
    static table = debugLogs;
    static morphName = 'App\\Models\\DebugLog';
    static fillable = ['context', 'type'];
}
