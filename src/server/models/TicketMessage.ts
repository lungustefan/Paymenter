import { Model, belongsTo, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { ticketMessages } from '@/server/db/schema';
import type { Row } from './_types';
import { Ticket } from './Ticket';
import { User } from './User';
import { TicketMessageAttachment } from './TicketMessageAttachment';
import { TicketMailLog } from './TicketMailLog';
import { TicketMessageObserver } from '@/server/observers/TicketMessageObserver';

export interface TicketMessage extends Row<typeof ticketMessages> {}

export class TicketMessage extends Model<{
    ticket: Ticket;
    user: User;
    attachments: TicketMessageAttachment[];
    ticketMailLog: TicketMailLog | null;
}> {
    static table = ticketMessages;
    static morphName = 'App\\Models\\TicketMessage';
    static fillable = ['ticket_id', 'user_id', 'message', 'ticket_mail_log_id'];
    static auditable = true;
    static observers = [TicketMessageObserver];

    static relations: Record<string, RelationDef> = {
        ticket: belongsTo(() => Ticket, 'ticket_id'),
        user: belongsTo(() => User, 'user_id'),
        attachments: hasMany(() => TicketMessageAttachment, 'ticket_message_id'),
        ticketMailLog: belongsTo(() => TicketMailLog, 'ticket_mail_log_id'),
    };
}
