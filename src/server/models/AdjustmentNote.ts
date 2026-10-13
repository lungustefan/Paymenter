import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { adjustmentNotes } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import type { Row } from './_types';
import { Invoice } from './Invoice';
import { AdjustmentNoteObserver } from '@/server/observers/AdjustmentNoteObserver';

export interface AdjustmentNote extends Row<typeof adjustmentNotes> {}

/** A credit (negative amount) or debit (positive amount) note on an invoice. */
export class AdjustmentNote extends Model<{ invoice: Invoice }> {
    static table = adjustmentNotes;
    static morphName = 'App\\Models\\AdjustmentNote';
    static fillable = ['invoice_id', 'type', 'number', 'amount', 'description', 'status'];
    static casts = { amount: 'decimal:2' };
    static auditable = true;
    static observers = [AdjustmentNoteObserver];
    static accessors = ['formattedAmount'];

    static relations: Record<string, RelationDef> = {
        invoice: belongsTo(() => Invoice, 'invoice_id'),
    };

    async formattedAmount(): Promise<Price> {
        const invoice = await this.rel('invoice');
        return Price.make({ price: Number(this.amount), currency: await invoice.rel('currency') });
    }
}
