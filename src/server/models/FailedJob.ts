import { Model } from '@/server/orm';
import { failedJobs } from '@/server/db/schema';
import type { Row } from './_types';

export interface FailedJob extends Row<typeof failedJobs> {}

export class FailedJob extends Model {
    static table = failedJobs;
    static casts = { failed_at: 'datetime' };
    static morphName = 'App\\Models\\FailedJob';
    static timestamps = false;
    static fillable = ['uuid', 'connection', 'queue', 'payload', 'exception', 'failed_at'];
}
