import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { notificationSubscriptions } from '@/server/db/schema';
import { isAllowedPushEndpoint } from '@/server/support/push-endpoint';
import type { Row } from './_types';
import { User } from './User';

export interface NotificationSubscription extends Row<typeof notificationSubscriptions> {}

export class NotificationSubscription extends Model<{ user: User }> {
    static table = notificationSubscriptions;
    static morphName = 'App\\Models\\NotificationSubscription';
    static fillable = ['user_id', 'endpoint', 'p256dh_key', 'auth_key'];
    static casts = { p256dh_key: 'encrypted', auth_key: 'encrypted' };
    static relations: Record<string, RelationDef> = { user: belongsTo(() => User, 'user_id') };

    /** Subscription object for the web-push library. */
    subscription() {
        if (!isAllowedPushEndpoint(this.endpoint)) throw new Error('Push subscription endpoint is not allowed.');
        return { endpoint: this.endpoint, keys: { p256dh: this.p256dh_key, auth: this.auth_key } };
    }
}
