import { Price } from '@/server/classes/Price';
import { setting } from '@/server/config';
import { sessionGet } from '@/server/session';
import type { Model } from '@/server/orm';
import type { Plan } from './Plan';
import type { PriceModel } from './Price';

/** `session('currency', config('settings.default_currency'))` */
export async function sessionCurrency(): Promise<string | null> {
    return sessionGet<string | null>('currency', setting('default_currency'));
}

/** Port of the `HasPlans` trait (Product and ConfigOption). */
export interface HasPlansModel extends Model<any> {
    dontShowUnavailablePrice?: boolean;
}

export async function availablePlans(model: HasPlansModel, currency?: string | null): Promise<Plan[]> {
    const cur = currency ?? (await sessionCurrency());
    const plans = (await model.rel('plans' as any)) as Plan[];
    const out: Plan[] = [];
    for (const plan of plans) {
        if (plan.type === 'free') {
            out.push(plan);
            continue;
        }
        const prices = (await plan.rel('prices')) as PriceModel[];
        const filtered = cur ? prices.filter((p) => p.currency_code === cur) : prices;
        if (filtered.length > 0) out.push(plan);
    }
    return out;
}

export async function priceFor(
    model: HasPlansModel,
    planId: number | null = null,
    billingPeriod: number | null = null,
    billingUnit: string | null = null,
    currency: string | null = null,
): Promise<Price> {
    const result: { price: PriceModel | null; currency: any } = { price: null, currency: null };
    const dont = model.dontShowUnavailablePrice ?? false;

    // Plan lookups must filter by the same currency the price is resolved in.
    const cur = currency ?? (await sessionCurrency());

    // Check for free plan
    const available = await availablePlans(model, cur);
    if (available.some((p) => p.type === 'free')) {
        return new Price(null, { free: true, dontShowUnavailablePrice: dont });
    }

    // If plan_id is not provided, and billing_period is provided, get the first plan with the billing period and time interval
    if (!planId && billingPeriod && billingUnit) {
        const plan = available.find((p) => p.billing_period === billingPeriod && p.billing_unit === billingUnit);
        planId = plan?.id ?? null;
        // The loop below is period-agnostic and would substitute another billing period's price.
        if (!planId) return Price.make(result, { dontShowUnavailablePrice: dont });
    }

    for (const plan of available.filter((p) => !planId || p.id === planId)) {
        const prices = (await plan.rel('prices')) as PriceModel[];
        for (const price of cur ? prices.filter((p) => p.currency_code === cur) : prices) {
            if (result.price === null || Number(price.price) < Number(result.price.price)) {
                result.price = price;
                result.currency = await price.rel('currency');
            }
        }
        if (result.price) break;
    }
    return Price.make(result, { dontShowUnavailablePrice: dont });
}
