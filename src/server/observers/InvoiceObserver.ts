import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { afterCommit } from '@/server/orm/context';
import { afterResponse } from '@/server/terminating';
import { processPaidInvoice } from '@/server/services/invoice/ProcessPaidInvoiceService';
import type { Invoice } from '@/server/models/Invoice';

export const InvoiceObserver = {
    async creating(invoice: Invoice) {
        await dispatch(Events.Invoice.Creating, { invoice });
    },
    async created(invoice: Invoice) {
        await dispatch(Events.Invoice.Created, { invoice });
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
