import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const TicketObserver = forward(Events.Ticket, 'ticket', ['created', 'updated', 'deleted']);
