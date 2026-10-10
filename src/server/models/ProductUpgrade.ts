import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { productUpgrades } from '@/server/db/schema';
import type { Row } from './_types';
import { Product } from './Product';

export interface ProductUpgrade extends Row<typeof productUpgrades> {}

export class ProductUpgrade extends Model<{ product: Product; upgrade: Product }> {
    static table = productUpgrades;
    static morphName = 'App\\Models\\ProductUpgrade';
    static guarded: string[] = [];
    static auditable = true;
    static relations: Record<string, RelationDef> = {
        product: belongsTo(() => Product, 'product_id'),
        upgrade: belongsTo(() => Product, 'upgrade_id'),
    };
}
