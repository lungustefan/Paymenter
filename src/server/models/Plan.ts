import { Model, hasMany, morphTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { plans } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { setting } from '@/server/config';
import type { Row } from './_types';
import { PriceModel } from './Price';
import { Currency } from './Currency';
import { Service } from './Service';
import { sessionCurrency } from './_plans';

export interface Plan extends Row<typeof plans> {}

export class Plan extends Model<{ prices: PriceModel[]; priceable: Model<any> | null; services: Service[] }> {
    static table = plans;
    static morphName = 'App\\Models\\Plan';
    static timestamps = false;
    static fillable = ['name', 'type', 'billing_period', 'billing_unit', 'sort'];
    static casts = { billing_period: 'integer' };
    static auditable = true;
    static accessors = ['billingDuration'];

    static relations: Record<string, RelationDef> = {
        prices: hasMany(() => PriceModel, 'plan_id'),
        priceable: morphTo('priceable'),
        services: hasMany(() => Service, 'plan_id'),
    };

    async price(currency: string | null = null): Promise<Price> {
        const cur = currency ?? (await sessionCurrency());
        if (this.type === 'free') {
            return new Price({ currency: cur ? await Currency.find(cur) : null }, { free: true });
        }
        const prices = await this.rel('prices');
        const price = prices.find((p) => p.currency_code === cur);

        // No price row in this currency: return unavailable instead of dereferencing null.
        if (!price) return Price.make({ price: null, setup_fee: null, currency: null });

        return Price.make({
            price: price as any,
            setup_fee: price.setup_fee,
            currency: await price.rel('currency'),
        });
    }

    /** Time between billing periods (in days). */
    async billingDuration(): Promise<number> {
        if (this.type === 'free' || this.type === 'one-time') return 0;
        const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
        const d = days[this.billing_unit as string];
        if (d === undefined) throw new Error(`Unhandled match case '${this.billing_unit}'`);
        return d * (this.billing_period ?? 0);
    }
}
void setting;
