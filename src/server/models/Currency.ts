import { Model, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { currencies } from '@/server/db/schema';
import { cacheFlush } from '@/server/cache';
import type { Row } from './_types';
import { Service } from './Service';
import { Order } from './Order';
import { Credit } from './Credit';
import { Cart } from './Cart';

export interface Currency extends Row<typeof currencies> {}

export class Currency extends Model<{ services: Service[]; orders: Order[]; credits: Credit[]; carts: Cart[] }> {
    static table = currencies;
    static morphName = 'App\\Models\\Currency';
    static timestamps = false;
    static incrementing = false;
    static primaryKey = 'code';
    static fillable = ['code', 'name', 'prefix', 'suffix', 'format'];

    static relations: Record<string, RelationDef> = {
        services: hasMany(() => Service, 'currency_code', 'code'),
        orders: hasMany(() => Order, 'currency_code', 'code'),
        credits: hasMany(() => Credit, 'currency_code', 'code'),
        carts: hasMany(() => Cart, 'currency_code', 'code'),
    };

    // Currencies change infrequently, so the entire cache is cleared on changes
    static override booted() {
        this.on('created', () => cacheFlush());
        this.on('saved', () => cacheFlush());
        this.on('deleted', () => cacheFlush());
    }
}
