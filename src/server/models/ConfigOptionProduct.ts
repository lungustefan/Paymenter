import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { configOptionProducts } from '@/server/db/schema';
import type { Row } from './_types';
import { ConfigOption } from './ConfigOption';
import { Product } from './Product';

export interface ConfigOptionProduct extends Row<typeof configOptionProducts> {}

export class ConfigOptionProduct extends Model<{ configOption: ConfigOption; product: Product }> {
    static table = configOptionProducts;
    static morphName = 'App\\Models\\ConfigOptionProduct';
    static timestamps = false;
    static fillable = ['config_option_id', 'product_id'];
    static auditable = true;
    static relations: Record<string, RelationDef> = {
        configOption: belongsTo(() => ConfigOption, 'config_option_id'),
        product: belongsTo(() => Product, 'product_id'),
    };
}
