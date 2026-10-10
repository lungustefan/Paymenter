import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const InvoiceItemObserver = forward(Events.InvoiceItem, 'invoiceItem', ['creating', 'created', 'updating', 'updated', 'deleted']);
