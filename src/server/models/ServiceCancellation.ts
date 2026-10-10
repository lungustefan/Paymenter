import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { serviceCancellations } from '@/server/db/schema';
import type { Row } from './_types';
import { Service } from './Service';
import { ServiceCancellationObserver } from '@/server/observers/ServiceCancellationObserver';

export interface ServiceCancellation extends Row<typeof serviceCancellations> {}

export class ServiceCancellation extends Model<{ service: Service }> {
    static table = serviceCancellations;
    static morphName = 'App\\Models\\ServiceCancellation';
    static fillable = ['service_id', 'reason', 'type'];
    static auditable = true;
    static observers = [ServiceCancellationObserver];
    static relations: Record<string, RelationDef> = { service: belongsTo(() => Service, 'service_id') };
}
