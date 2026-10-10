import { Model } from '@/server/orm';
import { emailLogs } from '@/server/db/schema';
import type { Row } from './_types';

export interface EmailLog extends Row<typeof emailLogs> {}

export class EmailLog extends Model {
    static table = emailLogs;
    static morphName = 'App\\Models\\EmailLog';
    static fillable = ['user_id', 'subject', 'body', 'to', 'sent_at', 'status', 'error', 'job_uuid'];
}
