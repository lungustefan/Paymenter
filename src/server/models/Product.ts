import { Model, belongsTo, belongsToMany, hasMany, hasManyThrough, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { products } from '@/server/db/schema';
import type { Row } from './_types';
import { Category } from './Category';
import { ConfigOption } from './ConfigOption';
import { ConfigOptionProduct } from './ConfigOptionProduct';
import { Server } from './Server';
import { Service } from './Service';
import { Setting } from './Setting';
import { Plan } from './Plan';
import { availablePlans, priceFor } from './_plans';

export interface Product extends Row<typeof products> {}

export interface ProductRelations {
    category: Category;
    configOptions: ConfigOption[];
    upgradableConfigOptions: ConfigOption[];
    server: Server | null;
    services: Service[];
    settings: Setting[];
    upgrades: Product[];
    plans: Plan[];
}

export class Product extends Model<ProductRelations> {
    static table = products;
    static morphName = 'App\\Models\\Product';
    static guarded: string[] = [];
    static auditable = true;
    static auditInclude = ['name', 'description', 'category_id', 'enabled'];

    static relations: Record<string, RelationDef> = {
        category: belongsTo(() => Category, 'category_id'),
        configOptions: hasManyThrough(() => ConfigOption, () => ConfigOptionProduct, 'product_id', 'id', 'id', 'config_option_id').scope((q) =>
            q.where('config_options.hidden', false).orderBy('config_options.sort', 'asc').orderBy('config_options.id', 'desc'),
        ),
        server: belongsTo(() => Server, 'server_id'),
        services: hasMany(() => Service, 'product_id'),
        settings: morphMany(() => Setting, 'settingable'),
        upgrades: belongsToMany(() => Product, 'product_upgrades', 'product_id', 'upgrade_id'),
        upgradableConfigOptions: hasManyThrough(() => ConfigOption, () => ConfigOptionProduct, 'product_id', 'id', 'id', 'config_option_id').scope((q) =>
            q.where('config_options.hidden', false).where('config_options.upgradable', true).orderBy('config_options.sort', 'asc').orderBy('config_options.id', 'desc'),
        ),
        plans: morphMany(() => Plan, 'priceable').scope((q) => q.orderBy('sort')),
    };

    availablePlans(currency?: string | null) {
        return availablePlans(this, currency);
    }

    price(planId: number | null = null, billingPeriod: number | null = null, billingUnit: string | null = null, currency: string | null = null) {
        return priceFor(this, planId, billingPeriod, billingUnit, currency);
    }
}
