import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { afterCommit } from '@/server/orm/context';
import { afterResponse } from '@/server/terminating';
import { processPaidInvoice } from '@/server/services/invoice/ProcessPaidInvoiceService';
import { createInvoiceSnapshot } from '@/server/services/invoice/CreateInvoiceSnapshotService';
import type { Invoice } from '@/server/models/Invoice';

// (the model imports this observer, so its constants cannot be imported here)
const DRAFT = 'draft';
const PENDING = 'pending';
const CANCELLED = 'cancelled';

export const InvoiceObserver = {
    async creating(invoice: Invoice) {
        await dispatch(Events.Invoice.Creating, { invoice });
    },
    async created(invoice: Invoice) {
        // the data of the user is locked as soon as the invoice leaves draft
        if (invoice.status !== DRAFT) await createInvoiceSnapshot(invoice);
        await dispatch(Events.Invoice.Created, { invoice });
        // a draft is not announced until it is published
        if (invoice.status === DRAFT) return;
        const sendEmail = invoice.send_create_email;
        // Items are added after the invoice itself, so finalisation (email + PDF) happens after the response
        await afterResponse(async () => {
            await dispatch(Events.Invoice.Finalized, { invoice, sendEmail });
        });
    },
    async updating(invoice: Invoice) {
        await dispatch(Events.Invoice.Updating, { invoice });
    },
    async updated(invoice: Invoice) {
        if (invoice.status === CANCELLED && invoice.getOriginal('status') !== CANCELLED) {
            await invoice.createCancellationCreditNote(invoice.cancellation_reason);
        }
        // publishing a draft: snapshot + announce it like a new invoice
        if (invoice.getOriginal('status') === DRAFT && invoice.status === PENDING) {
            await createInvoiceSnapshot(invoice);
            await dispatch(Events.Invoice.Created, { invoice });
            const sendEmail = invoice.send_create_email;
            await afterResponse(async () => {
                await dispatch(Events.Invoice.Finalized, { invoice, sendEmail });
            });
        }
        if (invoice.isDirty('status') && invoice.status === 'paid') {
            await afterCommit(async () => {
                await processPaidInvoice(invoice);
                await dispatch(Events.Invoice.Paid, { invoice });
            });
        }
        await dispatch(Events.Invoice.Updated, { invoice });
    },
    async deleted(invoice: Invoice) {
        await dispatch(Events.Invoice.Deleted, { invoice });
    },
};
