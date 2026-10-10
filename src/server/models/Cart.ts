import { Model, belongsTo, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { carts } from '@/server/db/schema';
import type { Row } from './_types';
import { Currency } from './Currency';
import { User } from './User';
import { CartItem } from './CartItem';
import { Coupon } from './Coupon';
import { CartObserver } from '@/server/observers/CartObserver';

export interface Cart extends Row<typeof carts> {}

export class Cart extends Model<{ currency: Currency | null; user: User | null; items: CartItem[]; coupon: Coupon | null }> {
    static table = carts;
    static morphName = 'App\\Models\\Cart';
    static fillable = ['user_id', 'currency_code', 'coupon_id'];
    static uniqueIds = ['ulid'];
    static observers = [CartObserver];

    static relations: Record<string, RelationDef> = {
        currency: belongsTo(() => Currency, 'currency_code'),
        user: belongsTo(() => User, 'user_id'),
        items: hasMany(() => CartItem, 'cart_id'),
        coupon: belongsTo(() => Coupon, 'coupon_id'),
    };
}
