import { Model, belongsToMany, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { roles } from '@/server/db/schema';
import type { Row } from './_types';
import type { User } from './User';
import { User as UserModel } from './User';

export interface Role extends Row<typeof roles> {}

export class Role extends Model<{ users: User[] }> {
    static table = roles;
    static morphName = 'App\\Models\\Role';
    static fillable = ['name', 'permissions'];
    static auditable = true;
    // the original declares belongsToMany(User) which (without a pivot table) is never used; users reference role_id
    static relations: Record<string, RelationDef> = {
        users: hasMany(() => UserModel, 'role_id'),
    };
}
void belongsToMany;
