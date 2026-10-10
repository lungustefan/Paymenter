import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { ExtensionHelper } from '@/server/extensions/helper';
import { round, truthy } from '@/server/lib/php';
import type { Row } from '@/server/models/_types';
import { Order } from '@/server/models/Order';
import type { Invoice } from '@/server/models/Invoice';
import { Affiliate } from './Affiliate';
import { extAffiliateOrders } from './schema';

export interface AffiliateOrder extends Row<typeof extAffiliateOrders> {}

export class AffiliateOrder extends Model<{ affiliate: Affiliate; order: Order }> {
    static table = extAffiliateOrders;
    static morphName = 'Paymenter\\Extensions\\Others\\Affiliates\\Models\\AffiliateOrder';
    static timestamps = false;
    static fillable = ['order_id', 'affiliate_id'];
    static relations: Record<string, RelationDef> = {
        affiliate: belongsTo(() => Affiliate, 'affiliate_id'),
        order: belongsTo(() => Order, 'order_id'),
    };

    /** Get the earnings made from this order: `{ [currency name]: amount }` */
    async earnings(): Promise<Record<string, number>> {
        const earnings: Record<string, number> = {};

        const order = (await this.rel('order'))!;
        const invoices = await (await order.invoices()).get();
        const extension = await ExtensionHelper.getExtension('other', 'Affiliates');
        const affiliate = (await this.rel('affiliate'))!;
        const rewardPercentage = truthy(affiliate.reward) ? Number(affiliate.reward) : Number(extension.config('default_reward'));

        for (const invoice of invoices as Invoice[]) {
            if (invoice.status !== 'paid') {
                continue;
            }
            const name = (await invoice.rel('currency'))!.name as string;
            if (earnings[name] === undefined) {
                earnings[name] = 0;
            }
            earnings[name] += ((await invoice.total()) * rewardPercentage) / 100;
        }

        for (const [currency, total] of Object.entries(earnings)) {
            // Round to 2 decimal places
            earnings[currency] = round(total, 2);
        }

        return earnings;
    }
}
