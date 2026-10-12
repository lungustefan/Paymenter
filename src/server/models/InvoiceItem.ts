import { Model, belongsTo, morphTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { invoiceItems } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { round } from '@/server/lib/php';
import type { Row } from './_types';
import { Invoice } from './Invoice';
import { Gateway } from './Gateway';
import { InvoiceItemObserver } from '@/server/observers/InvoiceItemObserver';

export interface InvoiceItem extends Row<typeof invoiceItems> {}

export class InvoiceItem extends Model<{ invoice: Invoice; reference: Model<any> | null; gateway: Gateway | null }> {
    static table = invoiceItems;
    static morphName = 'App\\Models\\InvoiceItem';
    static fillable = ['invoice_id', 'quantity', 'price', 'description', 'gateway_id', 'reference_id', 'reference_type'];
    static casts = { price: 'decimal:2' };
    static auditable = true;
    static observers = [InvoiceItemObserver];
    static accessors = ['formattedTotal', 'formattedPrice'];

    static relations: Record<string, RelationDef> = {
        invoice: belongsTo(() => Invoice, 'invoice_id'),
        reference: morphTo('reference'),
        gateway: belongsTo(() => Gateway, 'gateway_id'),
    };

    total(): number {
        return round(Number(this.price) * Number(this.quantity), 2);
    }

    async formattedTotal(): Promise<Price> {
        const invoice = await this.rel('invoice');
        return Price.make({ price: this.total(), currency: await invoice.rel('currency') });
    }

    async formattedPrice(): Promise<Price> {
        const invoice = await this.rel('invoice');
        return Price.make({ price: Number(this.price), currency: await invoice.rel('currency') });
    }
}
