import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const InvoiceTransactionObserver = forward(Events.InvoiceTransaction, 'invoiceTransaction', ['creating', 'created', 'updating', 'updated', 'deleted']);
