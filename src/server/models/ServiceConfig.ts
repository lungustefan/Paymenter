import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { serviceConfigs } from '@/server/db/schema';
import type { Row } from './_types';
import { Service } from './Service';
import { ConfigOption } from './ConfigOption';

export interface ServiceConfig extends Row<typeof serviceConfigs> {}

export class ServiceConfig extends Model<{ service: Service; configOption: ConfigOption; configValue: ConfigOption | null }> {
    static table = serviceConfigs;
    static morphName = 'App\\Models\\ServiceConfig';
    // NOTE: the original lists `service_id` in $fillable although the table is polymorphic (configurable_*).
    static fillable = ['service_id', 'config_option_id', 'config_value_id'];
    static auditable = true;
    static relations: Record<string, RelationDef> = {
        service: belongsTo(() => Service, 'service_id'),
        configOption: belongsTo(() => ConfigOption, 'config_option_id'),
        configValue: belongsTo(() => ConfigOption, 'config_value_id'),
    };
}
