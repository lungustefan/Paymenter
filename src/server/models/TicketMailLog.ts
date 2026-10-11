import { Model } from '@/server/orm';
import { ticketMailLogs } from '@/server/db/schema';
import type { Row } from './_types';

export interface TicketMailLog extends Row<typeof ticketMailLogs> {}

export class TicketMailLog extends Model {
    static table = ticketMailLogs;
    static morphName = 'App\\Models\\TicketMailLog';
    static fillable = ['message_id', 'subject', 'from', 'to', 'body', 'status'];
}
