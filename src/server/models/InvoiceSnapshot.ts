import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { invoiceSnapshots } from '@/server/db/schema';
import type { Row } from './_types';
import { Invoice } from './Invoice';

export interface InvoiceSnapshot extends Row<typeof invoiceSnapshots> {}

export class InvoiceSnapshot extends Model<{ invoice: Invoice }> {
    static table = invoiceSnapshots;
    static morphName = 'App\\Models\\InvoiceSnapshot';
    static fillable = ['name', 'properties', 'tax_name', 'tax_rate', 'tax_country', 'bill_to', 'invoice_id'];
    static casts = { tax_rate: 'decimal:2' };
    static relations: Record<string, RelationDef> = { invoice: belongsTo(() => Invoice, 'invoice_id') };
}
