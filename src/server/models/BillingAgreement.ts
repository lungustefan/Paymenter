import { Model, belongsTo, hasMany, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { billingAgreements } from '@/server/db/schema';
import type { Row } from './_types';
import { User } from './User';
import { Gateway } from './Gateway';
import { Service } from './Service';
import { Property } from './Property';

export interface BillingAgreement extends Row<typeof billingAgreements> {}

export class BillingAgreement extends Model<{ user: User; gateway: Gateway; services: Service[]; properties: Property[] }> {
    static table = billingAgreements;
    static morphName = 'App\\Models\\BillingAgreement';
    static fillable = ['ulid', 'user_id', 'gateway_id', 'name', 'external_reference', 'type', 'expiry'];
    static uniqueIds = ['ulid'];
    static softDeletes = true;
    static auditable = true;

    static relations: Record<string, RelationDef> = {
        user: belongsTo(() => User, 'user_id'),
        gateway: belongsTo(() => Gateway, 'gateway_id'),
        services: hasMany(() => Service, 'billing_agreement_id'),
        properties: morphMany(() => Property, 'model'),
    };
}
