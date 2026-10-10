import { Model, belongsTo, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import type { Row } from '@/server/models/_types';
import { User } from '@/server/models/User';
import { AffiliateOrder } from './AffiliateOrder';
import { extAffiliates } from './schema';

export interface Affiliate extends Row<typeof extAffiliates> {}

export class Affiliate extends Model<{ user: User; orders: AffiliateOrder[] }> {
    static table = extAffiliates;
    static morphName = 'Paymenter\\Extensions\\Others\\Affiliates\\Models\\Affiliate';
    static fillable = ['user_id', 'code', 'visitors', 'reward', 'discount'];
    static relations: Record<string, RelationDef> = {
        user: belongsTo(() => User, 'user_id'),
        orders: hasMany(() => AffiliateOrder, 'affiliate_id'),
    };

    /** `$affiliate->increment('signups')` */
    async incrementColumn(column: 'signups' | 'visitors') {
        await Affiliate.query().where('id', this.id).increment(column);
        (this as any)[column] = ((this as any)[column] ?? 0) + 1;
    }

    /**
     * Get the earnings made by this affiliate: `{ [currency name]: amount }`
     * (an empty list when there are none, like the empty PHP array)
     */
    async earnings(): Promise<Record<string, number> | never[]> {
        const earnings: Record<string, number> = {};
        for (const order of await this.rel('orders')) {
            for (const [currency, total] of Object.entries(await order.earnings())) {
                if (earnings[currency] === undefined) {
                    earnings[currency] = 0;
                }
                earnings[currency] += total;
            }
        }

        return Object.keys(earnings).length ? earnings : [];
    }
}
