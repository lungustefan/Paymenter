import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { couponProducts } from '@/server/db/schema';
import type { Row } from './_types';
import { Coupon } from './Coupon';
import { Product } from './Product';

export interface CouponProduct extends Row<typeof couponProducts> {}

export class CouponProduct extends Model<{ coupon: Coupon; product: Product }> {
    static table = couponProducts;
    static morphName = 'App\\Models\\CouponProduct';
    static fillable = ['coupon_id', 'product_id'];
    static auditable = true;
    static relations: Record<string, RelationDef> = {
        coupon: belongsTo(() => Coupon, 'coupon_id'),
        product: belongsTo(() => Product, 'product_id'),
    };
}
