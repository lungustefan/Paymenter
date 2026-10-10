import { Model } from '@/server/orm';
import { apiKeys } from '@/server/db/schema';
import type { Row } from './_types';

export interface ApiKey extends Row<typeof apiKeys> {}

export class ApiKey extends Model {
    static table = apiKeys;
    static morphName = 'App\\Models\\ApiKey';
    static fillable = ['name', 'permissions', 'token', 'user_id', 'type', 'ip_addresses', 'last_used_at', 'enabled'];
    static auditable = true;
    static auditExclude = ['last_used_at'];
}
