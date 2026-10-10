import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { notificationPreferences } from '@/server/db/schema';
import type { Row } from './_types';
import { NotificationTemplate } from './NotificationTemplate';
import { User } from './User';

export interface NotificationPreference extends Row<typeof notificationPreferences> {}

export class NotificationPreference extends Model<{ notificationTemplate: NotificationTemplate; user: User }> {
    static table = notificationPreferences;
    static morphName = 'App\\Models\\NotificationPreference';
    static fillable = ['user_id', 'mail_enabled', 'in_app_enabled', 'notification_template_id'];
    static casts = { mail_enabled: 'boolean', in_app_enabled: 'boolean' };
    static relations: Record<string, RelationDef> = {
        notificationTemplate: belongsTo(() => NotificationTemplate, 'notification_template_id'),
        user: belongsTo(() => User, 'user_id'),
    };
}
