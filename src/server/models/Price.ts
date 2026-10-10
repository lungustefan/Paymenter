import { Model, belongsTo, morphTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { prices } from '@/server/db/schema';
import type { Row } from './_types';
import { Currency } from './Currency';
import { Plan } from './Plan';

export interface PriceModel extends Row<typeof prices> {}

/** `App\Models\Price` (named PriceModel here because `Price` is the money value class). */
export class PriceModel extends Model<{ priceable: Model<any> | null; currency: Currency | null; plan: Plan | null }> {
    static table = prices;
    static morphName = 'App\\Models\\Price';
    static timestamps = false;
    static guarded: string[] = [];
    static auditable = true;

    static relations: Record<string, RelationDef> = {
        priceable: morphTo('priceable'),
        currency: belongsTo(() => Currency, 'currency_code'),
        plan: belongsTo(() => Plan, 'plan_id'),
    };
}
