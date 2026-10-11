import { Model, belongsTo, belongsToMany, hasMany, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { configOptions } from '@/server/db/schema';
import type { Row } from './_types';
import { Product } from './Product';
import { ServiceConfig } from './ServiceConfig';
import { Plan } from './Plan';
import { availablePlans, priceFor } from './_plans';

export interface ConfigOption extends Row<typeof configOptions> {}

export class ConfigOption extends Model<{
    parent: ConfigOption | null;
    children: ConfigOption[];
    products: Product[];
    serviceConfigs: ServiceConfig[];
    plans: Plan[];
}> {
    static table = configOptions;
    static morphName = 'App\\Models\\ConfigOption';
    static fillable = ['name', 'description', 'env_variable', 'type', 'sort', 'hidden', 'parent_id', 'upgradable'];
    static auditable = true;

    /** `protected $dontShowUnavailablePrice = true;` */
    dontShowUnavailablePrice = true;

    static relations: Record<string, RelationDef> = {
        parent: belongsTo(() => ConfigOption, 'parent_id'),
        children: hasMany(() => ConfigOption, 'parent_id').scope((q) => q.orderBy('sort')),
        products: belongsToMany(() => Product, 'config_option_products', 'config_option_id', 'product_id'),
        serviceConfigs: hasMany(() => ServiceConfig, 'config_option_id'),
        plans: morphMany(() => Plan, 'priceable').scope((q) => q.orderBy('sort')),
    };

    availablePlans(currency?: string | null) {
        return availablePlans(this, currency);
    }

    price(planId: number | null = null, billingPeriod: number | null = null, billingUnit: string | null = null, currency: string | null = null) {
        return priceFor(this, planId, billingPeriod, billingUnit, currency);
    }
}
