import { Model, belongsTo, hasMany, hasOne, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { invoices } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { Settings } from '@/server/classes/Settings';
import { setting } from '@/server/config';
import { sum } from '@/server/lib/php';
import type { Row } from './_types';
import { Currency } from './Currency';
import { User } from './User';
import { InvoiceItem } from './InvoiceItem';
import { InvoiceTransaction } from './InvoiceTransaction';
import { InvoiceSnapshot } from './InvoiceSnapshot';
import { Property } from './Property';
import { TaxRate } from './TaxRate';
import { InvoiceObserver } from '@/server/observers/InvoiceObserver';
import { InvoiceTransactionStatus } from '@/server/enums';

export interface Invoice extends Row<typeof invoices> {}

export interface InvoiceRelations {
    currency: Currency | null;
    user: User;
    items: InvoiceItem[];
    transactions: InvoiceTransaction[];
    snapshot: InvoiceSnapshot | null;
    properties: Property[];
}

export class Invoice extends Model<InvoiceRelations> {
    static STATUS_PENDING = 'pending';
    static STATUS_PAID = 'paid';
    static STATUS_CANCELLED = 'cancelled';

    static table = invoices;
    static casts = { due_at: 'date' };
    static morphName = 'App\\Models\\Invoice';
    static fillable = ['number', 'user_id', 'currency_code', 'due_at', 'status'];
    static auditable = true;
    static observers = [InvoiceObserver];
    static accessors = [
        'total', 'formattedTotal', 'formattedRemaining', 'remaining', 'tax', 'userProperties', 'userName', 'billTo',
    ];

    /** `public bool $send_create_email = true;` */
    send_create_email = true;

    static relations: Record<string, RelationDef> = {
        currency: belongsTo(() => Currency, 'currency_code'),
        user: belongsTo(() => User, 'user_id'),
        items: hasMany(() => InvoiceItem, 'invoice_id'),
        transactions: hasMany(() => InvoiceTransaction, 'invoice_id'),
        snapshot: hasOne(() => InvoiceSnapshot, 'invoice_id'),
        properties: morphMany(() => Property, 'model'),
    };

    async total(): Promise<number> {
        const items = await this.rel('items');
        return sum(items, (i) => Number(i.price) * Number(i.quantity));
    }

    async remaining(): Promise<number> {
        const total = await this.total();
        const paid = sum(
            (await this.rel('transactions')).filter((t) => t.status === InvoiceTransactionStatus.Succeeded),
            (t) => Number(t.amount),
        );
        return total - paid;
    }

    async formattedTotal(): Promise<Price> {
        return Price.make({ price: await this.total(), currency: await this.rel('currency'), tax: await this.tax() });
    }

    async formattedRemaining(): Promise<Price> {
        return Price.make({ price: await this.remaining(), currency: await this.rel('currency'), tax: await this.tax() });
    }

    /**
     * Tax model of the invoice: either the locked snapshot or the user's country.
     */
    async tax(): Promise<TaxRate | null> {
        const snapshot = await this.rel('snapshot');
        if (setting('invoice_snapshot', true) && snapshot?.tax_name) {
            return new TaxRate({ name: snapshot.tax_name, rate: snapshot.tax_rate, country: snapshot.tax_country }) as any;
        }
        return (await Settings.tax(await this.rel('user'))) as any;
    }

    async userProperties(): Promise<Record<string, string>> {
        const snapshot = await this.rel('snapshot');
        if (setting('invoice_snapshot', true) && snapshot?.properties) return snapshot.properties;
        const user = await this.rel('user');
        const props = await user
            .relation<Property>('properties')
            .whereHas('parent_property', (q) => q.where('show_on_invoice', true))
            .get();
        const out: Record<string, string> = {};
        for (const p of props) out[p.key] = p.value as string;
        return out;
    }

    async userName(): Promise<string> {
        const snapshot = await this.rel('snapshot');
        if (setting('invoice_snapshot', true) && snapshot?.name) return snapshot.name;
        return (await this.rel('user')).displayName();
    }

    async billTo(): Promise<string> {
        const snapshot = await this.rel('snapshot');
        if (setting('invoice_snapshot', true) && snapshot?.bill_to) return snapshot.bill_to;
        return setting('bill_to_text', setting('company_name'));
    }

    /** Route key: the invoice number when set, otherwise the id. */
    getRouteKey(): string | number {
        return this.number || this.id;
    }

    /** Route-model binding by number first, then by numeric id. */
    static async resolveRouteBinding(value: string): Promise<Invoice | null> {
        const q = Invoice.query().where('number', value);
        if (/^\d+$/.test(value)) q.orWhere('id', value);
        const rows = await q.get();
        // number match wins over id match
        return rows.find((r) => String(r.number) === value) ?? rows[0] ?? null;
    }
}
