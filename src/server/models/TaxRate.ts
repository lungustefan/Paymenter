import { Model } from '@/server/orm';
import { taxRates } from '@/server/db/schema';
import type { Row } from './_types';

export interface TaxRate extends Row<typeof taxRates> {}

export class TaxRate extends Model {
    static table = taxRates;
    static morphName = 'App\\Models\\TaxRate';
    static fillable = ['name', 'rate', 'country'];
    static auditable = true;
}
