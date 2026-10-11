import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { invoiceTransactions } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import type { Row } from './_types';
import { Invoice } from './Invoice';
import { Gateway } from './Gateway';
import { InvoiceTransactionObserver } from '@/server/observers/InvoiceTransactionObserver';

export interface InvoiceTransaction extends Row<typeof invoiceTransactions> {}

export class InvoiceTransaction extends Model<{ invoice: Invoice; gateway: Gateway | null }> {
    static table = invoiceTransactions;
    static morphName = 'App\\Models\\InvoiceTransaction';
    static fillable = ['invoice_id', 'gateway_id', 'amount', 'fee', 'transaction_id', 'status', 'is_credit_transaction'];
    static casts = { amount: 'decimal:2', fee: 'decimal:2' };
    static auditable = true;
    static observers = [InvoiceTransactionObserver];
    static accessors = ['formattedFee', 'formattedAmount'];

    static relations: Record<string, RelationDef> = {
        invoice: belongsTo(() => Invoice, 'invoice_id'),
        gateway: belongsTo(() => Gateway, 'gateway_id'),
    };

    async formattedFee(): Promise<Price> {
        const invoice = await this.rel('invoice');
        return Price.make({ price: Number(this.fee), currency: await invoice.rel('currency') });
    }

    async formattedAmount(): Promise<Price> {
        const invoice = await this.rel('invoice');
        return Price.make({ price: Number(this.amount), currency: await invoice.rel('currency') });
    }
}
