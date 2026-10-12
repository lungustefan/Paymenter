import { Model, belongsToMany, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { coupons } from '@/server/db/schema';
import type { Row } from './_types';
import { Product } from './Product';
import { Service } from './Service';

export interface Coupon extends Row<typeof coupons> {}

export class Coupon extends Model<{ products: Product[]; services: Service[] }> {
    static table = coupons;
    static morphName = 'App\\Models\\Coupon';
    static fillable = [
        'type', 'applies_to', 'time', 'code', 'value', 'max_uses', 'max_uses_per_user', 'starts_at', 'expires_at', 'recurring',
    ];
    static casts = { max_uses: 'integer', max_uses_per_user: 'integer', value: 'float', starts_at: 'datetime', expires_at: 'datetime' };
    static auditable = true;

    static relations: Record<string, RelationDef> = {
        products: belongsToMany(() => Product, 'coupon_products', 'coupon_id', 'product_id'),
        services: hasMany(() => Service, 'coupon_id'),
    };

    async hasExceededMaxUsesPerUser(userId: number): Promise<boolean> {
        if (!this.max_uses_per_user) return false;
        return (await this.relation('services').where('user_id', userId).count()) >= this.max_uses_per_user;
    }

    calculateDiscount(price: number, type: 'price' | 'setup_fee' = 'price'): number {
        if (!['price', 'setup_fee'].includes(type)) throw new Error('Invalid type for coupon discount calculation');
        if (!['all', type].includes(this.applies_to)) return 0;

        let discount = 0;
        if (this.type === 'percentage') discount = (price * Number(this.value)) / 100;
        else if (this.type === 'fixed') discount = Number(this.value);
        if (price < discount) discount = price;
        return discount;
    }
}
