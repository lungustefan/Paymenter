import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { credits } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import type { Row } from './_types';
import { User } from './User';
import { Currency } from './Currency';

export interface Credit extends Row<typeof credits> {}

export class Credit extends Model<{ user: User; currency: Currency | null }> {
    static table = credits;
    static morphName = 'App\\Models\\Credit';
    static fillable = ['currency_code', 'amount', 'user_id'];
    static auditable = true;
    static accessors = ['formattedAmount'];

    static relations: Record<string, RelationDef> = {
        user: belongsTo(() => User, 'user_id'),
        currency: belongsTo(() => Currency, 'currency_code', 'code'),
    };

    async formattedAmount(): Promise<Price> {
        return Price.make({ price: Number(this.amount), currency: await this.rel('currency') });
    }
}
