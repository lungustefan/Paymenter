import { Model, belongsTo, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { serviceUpgrades } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { Carbon } from '@/server/lib/carbon';
import type { Row } from './_types';
import { Service } from './Service';
import { Product } from './Product';
import { Plan } from './Plan';
import { Invoice } from './Invoice';
import { ServiceConfig } from './ServiceConfig';
import { ServiceUpgradeObserver } from '@/server/observers/ServiceUpgradeObserver';

export interface ServiceUpgrade extends Row<typeof serviceUpgrades> {}

type Priced = { id?: number; is?: (o: any) => boolean; price: (planId: null, period: number | null, unit: string | null, currency: string) => Promise<Price> };

export class ServiceUpgrade extends Model<{
    service: Service;
    product: Product | null;
    plan: Plan | null;
    invoice: Invoice | null;
    configs: ServiceConfig[];
}> {
    static STATUS_PENDING = 'pending';
    static STATUS_COMPLETED = 'completed';

    static table = serviceUpgrades;
    static morphName = 'App\\Models\\ServiceUpgrade';
    static guarded: string[] = [];
    static auditable = true;
    static observers = [ServiceUpgradeObserver];

    static relations: Record<string, RelationDef> = {
        service: belongsTo(() => Service, 'service_id'),
        product: belongsTo(() => Product, 'product_id'),
        plan: belongsTo(() => Plan, 'plan_id'),
        invoice: belongsTo(() => Invoice, 'invoice_id'),
        configs: morphMany(() => ServiceConfig, 'configurable'),
    };

    async calculateProratedAmount(oldItem: any | null, newItem: any | null): Promise<Price> {
        if (
            !newItem ||
            (oldItem &&
                ((typeof newItem.is === 'function' && newItem.is(oldItem)) ||
                    (oldItem.id !== undefined && newItem.id !== undefined && oldItem.id === newItem.id)))
        ) {
            return this.makePrice();
        }

        const service = await this.rel('service');
        const plan = (await service.rel('plan'))!;
        const newPrice = (await (newItem as Priced).price(null, plan.billing_period, plan.billing_unit, service.currency_code)).price;

        if (!service.expires_at) return this.makePrice(newPrice);

        const billingPeriodDays = await this.getBillingPeriodDays();
        const remainingDays = await this.getRemainingDays();
        const priceDifference = newPrice - (await this.resolveOldItemPrice(oldItem));
        const total = billingPeriodDays > 0 ? (priceDifference / billingPeriodDays) * remainingDays : priceDifference;
        return this.makePrice(total);
    }

    async calculatePrice(): Promise<Price> {
        const service = await this.rel('service');
        let total = (await this.calculateProratedAmount(await service.rel('product'), await this.rel('product'))).price;

        for (const config of await this.rel('configs')) {
            const configValue = await config.rel('configValue');
            if (configValue) {
                const oldConfig = (await service.rel('configs')).find((c) => c.config_option_id === config.config_option_id);
                const oldValue = oldConfig ? await oldConfig.rel('configValue') : null;
                total += (await this.calculateProratedAmount(oldValue, configValue)).price;
            }
        }

        // Cap refunds to what was actually paid when coupon exists
        if (total < 0 && service.coupon_id) total = Math.max(total, -(await this.getMaxRefundAmount()));

        return this.makePrice(total);
    }

    protected async resolveOldItemPrice(oldItem: any): Promise<number> {
        if (!oldItem) return 0;
        const service = await this.rel('service');
        const plan = (await service.rel('plan'))!;
        const p = (await oldItem.price(null, plan.billing_period, plan.billing_unit, service.currency_code))?.price ?? 0;
        return Number(p);
    }

    protected async makePrice(amount = 0): Promise<Price> {
        const service = await this.rel('service');
        return Price.make({ price: amount, currency: await service.rel('currency') });
    }

    protected async getBillingPeriodDays(): Promise<number> {
        const service = await this.rel('service');
        const plan = (await service.rel('plan'))!;
        switch (plan.billing_unit) {
            case 'day': return plan.billing_period!;
            case 'week': return plan.billing_period! * 7;
            case 'month': return plan.billing_period! * 30;
            case 'year': return plan.billing_period! * 365;
            default: return 0;
        }
    }

    protected async getRemainingDays(): Promise<number> {
        const service = await this.rel('service');
        if (!service.expires_at) return 0;
        const billingPeriodDays = await this.getBillingPeriodDays();
        // `expires_at->startOfDay()->diffInDays(now()->startOfDay(), absolute)` (typed `int` in the original => truncated)
        return Math.min(service.expires_at.startOfDay().diffInWholeDays(Carbon.now().startOfDay(), true), billingPeriodDays);
    }

    async getMaxRefundAmount(): Promise<number> {
        const service = await this.rel('service');
        // We don't refund if service has no due date (one-time or free plans)
        if (!service.expires_at) return 0;
        const billingPeriodDays = await this.getBillingPeriodDays();
        const remainingDays = await this.getRemainingDays();
        const paidAmount = Number(await service.calculatePrice());
        return billingPeriodDays > 0 ? (paidAmount / billingPeriodDays) * remainingDays : paidAmount;
    }
}
