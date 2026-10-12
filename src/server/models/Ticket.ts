import { Model, belongsTo, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { tickets } from '@/server/db/schema';
import type { Row } from './_types';
import { User } from './User';
import { Service } from './Service';
import { TicketMessage } from './TicketMessage';
import { TicketObserver } from '@/server/observers/TicketObserver';

export interface Ticket extends Row<typeof tickets> {}

export class Ticket extends Model<{ user: User; assignedTo: User | null; service: Service | null; messages: TicketMessage[] }> {
    static table = tickets;
    static morphName = 'App\\Models\\Ticket';
    static fillable = ['subject', 'status', 'priority', 'department', 'user_id', 'assigned_to', 'service_id'];
    static auditable = true;
    static observers = [TicketObserver];

    static relations: Record<string, RelationDef> = {
        user: belongsTo(() => User, 'user_id'),
        assignedTo: belongsTo(() => User, 'assigned_to'),
        service: belongsTo(() => Service, 'service_id'),
        messages: hasMany(() => TicketMessage, 'ticket_id'),
    };
}
