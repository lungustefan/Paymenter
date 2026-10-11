import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const TicketMessageObserver = forward(Events.TicketMessage, 'ticketMessage', ['created', 'updated', 'deleted']);
