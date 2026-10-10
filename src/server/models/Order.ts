import { Model, belongsTo, hasMany, hasOne } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { orders } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { sum } from '@/server/lib/php';
import type { Row } from './_types';
import { User } from './User';
import { Service } from './Service';
import { Currency } from './Currency';
import { Invoice } from './Invoice';
import { InvoiceItem } from './InvoiceItem';
import { OrderObserver } from '@/server/observers/OrderObserver';

export interface Order extends Row<typeof orders> {}

export interface OrderRelations {
    user: User;
    services: Service[];
    currency: Currency | null;
}

export class Order extends Model<OrderRelations> {
    static table = orders;
    static morphName = 'App\\Models\\Order';
    static fillable = ['user_id', 'currency_code'];
    static auditable = true;
    static observers = [OrderObserver];
    static accessors = ['total', 'formattedTotal', 'invoices'];

    /** `public bool $send_create_email = true;` */
    send_create_email = true;

    static relations: Record<string, RelationDef> = {
        user: belongsTo(() => User, 'user_id'),
        services: hasMany(() => Service, 'order_id'),
        currency: hasOne(() => Currency, 'code', 'currency_code'),
    };

    /** Total of the order. */
    async total(): Promise<number> {
        const services = await this.rel('services');
        return sum(services, (s) => Number(s.price) * Number(s.quantity));
    }

    async formattedTotal(): Promise<Price> {
        return Price.make({ price: await this.total(), currency: await this.rel('currency') });
    }

    /** Invoices of all services of this order: order -> service -> invoiceItem -> invoice. */
    async invoices() {
        const services = await this.rel('services');
        const ids: number[] = [];
        for (const service of services) {
            for (const item of await service.rel('invoiceItems')) ids.push(item.invoice_id);
        }
        return Invoice.query().whereIn('id', ids);
    }
}
void InvoiceItem;
