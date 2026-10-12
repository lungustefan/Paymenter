import { setting } from '@/server/config';
import { Settings } from '@/server/classes/Settings';
import type { Invoice } from '@/server/models/Invoice';

/** Save the name, address, tax rate... of the user on the invoice, so later changes do not alter it. */
/** `force` skips the `invoice_snapshot` setting (the backfill of the snapshots table does not look at it). */
export async function createInvoiceSnapshot(invoice: Invoice, force = false): Promise<void> {
    if ((!force && !setting('invoice_snapshot', true)) || (await invoice.rel('snapshot'))) return;
    const user = await invoice.rel('user');
    const data: Record<string, any> = {
        name: user?.displayName() ?? null,
        properties: await invoice.userProperties(),
        bill_to: setting('bill_to_text', setting('company_name')),
    };
    const tax = await Settings.tax(user as any);
    if (tax) {
        data.tax_name = tax.name;
        data.tax_rate = tax.rate;
        data.tax_country = tax.country;
    }
    await invoice.relation('snapshot').create(data);
    invoice.unsetRelation('snapshot');
}

export class CreateInvoiceSnapshotService {
    handle(invoice: Invoice) {
        return createInvoiceSnapshot(invoice);
    }
}
