import { Model, belongsTo, hasMany, hasOne, hasManyThrough, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { services } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { Settings } from '@/server/classes/Settings';
import { Carbon } from '@/server/lib/carbon';
import { numberFormat } from '@/server/lib/php';
import type { Row } from './_types';
import { Order } from './Order';
import { Coupon } from './Coupon';
import { Currency } from './Currency';
import { User } from './User';
import { Product } from './Product';
import { Plan } from './Plan';
import { ServiceConfig } from './ServiceConfig';
import { InvoiceItem } from './InvoiceItem';
import { Invoice } from './Invoice';
import { ServiceCancellation } from './ServiceCancellation';
import { ServiceUpgrade } from './ServiceUpgrade';
import { BillingAgreement } from './BillingAgreement';
import { Property } from './Property';
import { ServiceObserver } from '@/server/observers/ServiceObserver';

export interface Service extends Row<typeof services> {}

export interface ServiceRelations {
    order: Order | null;
    coupon: Coupon | null;
    currency: Currency | null;
    user: User;
    product: Product | null;
    plan: Plan | null;
    configs: ServiceConfig[];
    invoiceItems: InvoiceItem[];
    invoices: Invoice[];
    cancellation: ServiceCancellation | null;
    upgrade: ServiceUpgrade[];
    billingAgreement: BillingAgreement | null;
    properties: Property[];
}

export class Service extends Model<ServiceRelations> {
    static STATUS_PENDING = 'pending';
    static STATUS_ACTIVE = 'active';
    static STATUS_CANCELLED = 'cancelled';
    static STATUS_SUSPENDED = 'suspended';

    static table = services;
    static morphName = 'App\\Models\\Service';
    static fillable = [
        'order_id', 'product_id', 'plan_id', 'quantity', 'price', 'expires_at', 'subscription_id', 'status',
        'coupon_id', 'user_id', 'currency_code', 'billing_agreement_id',
    ];
    static casts = { expires_at: 'date' };
    static auditable = true;
    static observers = [ServiceObserver];
    static accessors = ['formattedPrice', 'baseLabel', 'description', 'cancellable', 'upgradable'];
    static accessorMap = { label: 'displayLabel' };

    static relations: Record<string, RelationDef> = {
        order: belongsTo(() => Order, 'order_id'),
        coupon: belongsTo(() => Coupon, 'coupon_id'),
        currency: hasOne(() => Currency, 'code', 'currency_code'),
        user: belongsTo(() => User, 'user_id'),
        product: belongsTo(() => Product, 'product_id'),
        plan: belongsTo(() => Plan, 'plan_id'),
        configs: morphMany(() => ServiceConfig, 'configurable'),
        invoiceItems: morphMany(() => InvoiceItem, 'reference'),
        invoices: hasManyThrough(() => Invoice, () => InvoiceItem, 'reference_id', 'id', 'id', 'invoice_id', (q) =>
            q.where('reference_type', 'App\\Models\\Service'),
        ),
        cancellation: hasOne(() => ServiceCancellation, 'service_id'),
        upgrade: hasMany(() => ServiceUpgrade, 'service_id'),
        billingAgreement: belongsTo(() => BillingAgreement, 'billing_agreement_id'),
        properties: morphMany(() => Property, 'model'),
    };

    /** Price of the service (price x quantity). */
    async formattedPrice(): Promise<Price> {
        return Price.make({ price: Number(this.price) * Number(this.quantity), currency: await this.rel('currency') });
    }

    async baseLabel(): Promise<string> {
        const product = await this.rel('product');
        return `${product?.name} #${this.id}`;
    }

    /** `label` accessor: the custom label, or "<product> #<id>". (`label` itself is also a column.) */
    async displayLabel(): Promise<string> {
        return this.label || (await this.baseLabel());
    }

    /** Description for the next invoice item. */
    async description(): Promise<string> {
        const plan = (await this.rel('plan'))!;
        const product = (await this.rel('product'))!;
        if (plan.type === 'free' || plan.type === 'one-time') return product.name;
        const date = this.expires_at ?? Carbon.now();
        const endDate = date.addUnit(plan.billing_unit!, plan.billing_period!);
        return `${product.name} (${date.format('M d, Y')} - ${endDate.format('M d, Y')})`;
    }

    /** Calculate the next due date. */
    async calculateNextDueDate(): Promise<Carbon | null> {
        const plan = (await this.rel('plan'))!;
        if (plan.type === 'one-time' || plan.type === 'free') return null;
        let date: Carbon;
        if (!this.expires_at || this.status !== Service.STATUS_ACTIVE) {
            // Make sure that if a service is being renewed after suspension or pending, we use the current date as base
            date = Carbon.now();
        } else {
            date = this.expires_at;
        }
        return date.addUnit(plan.billing_unit!, plan.billing_period!);
    }

    async cancellable(): Promise<boolean> {
        const plan = (await this.rel('plan'))!;
        const cancellation = await this.rel('cancellation');
        return this.status !== 'cancelled' && plan.type !== 'free' && plan.type !== 'one-time' && !cancellation;
    }

    async upgradable(): Promise<boolean> {
        const product = (await this.rel('product'))!;
        const upgrades = await this.productUpgrades();
        const configOptions = await product.relation('upgradableConfigOptions').count();
        const pending = (await this.rel('upgrade')).filter((u) => u.status === ServiceUpgrade.STATUS_PENDING).length;
        return (upgrades.length > 0 || configOptions > 0) && this.status === 'active' && pending === 0;
    }

    /** Products this service can be upgraded to (same billing cycle only). */
    async productUpgrades(): Promise<Array<Product & { plan?: Plan }>> {
        const product = (await this.rel('product'))!;
        const plan = (await this.rel('plan'))!;
        const out: Array<Product & { plan?: Plan }> = [];
        for (const up of await product.rel('upgrades')) {
            // Check stock
            if (up.stock !== null && up.stock !== undefined && up.stock - this.quantity < 0) continue;
            // Only get the upgrades that have the exact same billing cycle as the service
            const plans = await up.relation<Plan>('plans').where('billing_unit', plan.billing_unit).where('billing_period', plan.billing_period).get();
            if (plans.length > 0) {
                (up as any).plan = plans[0];
                out.push(up as any);
            }
        }
        return out;
    }

    /** Calculate the current price of the service, including config options, coupon and exclusive tax. */
    async calculatePrice(): Promise<string> {
        const plan = (await this.rel('plan'))!;
        const currencyCode = this.currency_code;
        let price = (await plan.price(currencyCode)).price;

        for (const config of await this.rel('configs')) {
            const configValue = await config.rel('configValue');
            if (configValue) {
                const p = await configValue.price(null, plan.billing_period, plan.billing_unit, currencyCode);
                price += p.price;
            }
        }

        // Add coupon discount if applicable
        const coupon = await this.rel('coupon');
        if (coupon) {
            const paid = await this.relation<Invoice>('invoices').where('status', 'paid').count();
            const invoices = paid + 1;
            // If it already used for the recurring period, do not apply the discount
            if (!coupon.recurring || invoices <= coupon.recurring) {
                price -= coupon.calculateDiscount(price);
            }
        }

        const user = await this.rel('user');
        const result = (
            await Price.make(
                { price, currency: await this.rel('currency') },
                { apply_exclusive_tax: true, tax: await Settings.tax(user) },
            )
        ).price;
        return numberFormat(result, 2, '.', '');
    }
}
