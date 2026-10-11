import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { userAuthenticationLogs } from '@/server/db/schema';
import type { Row } from './_types';
import { User } from './User';

export interface UserAuthenticationLog extends Row<typeof userAuthenticationLogs> {}

export class UserAuthenticationLog extends Model<{ user: User }> {
    static table = userAuthenticationLogs;
    static morphName = 'App\\Models\\UserAuthenticationLog';
    static fillable = ['user_id', 'ip_address'];
    static relations: Record<string, RelationDef> = { user: belongsTo(() => User, 'user_id') };
}
