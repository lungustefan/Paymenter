import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { notifications } from '@/server/db/schema';
import { Carbon } from '@/server/lib/carbon';
import type { Row } from './_types';
import { User } from './User';
import { NotificationObserver } from '@/server/observers/NotificationObserver';

export interface Notification extends Row<typeof notifications> {}

export class Notification extends Model<{ user: User }> {
    static table = notifications;
    static morphName = 'App\\Models\\Notification';
    static fillable = ['user_id', 'title', 'body', 'url'];
    static observers = [NotificationObserver];
    static relations: Record<string, RelationDef> = { user: belongsTo(() => User, 'user_id') };

    async markAsRead() {
        this.read_at = Carbon.now();
        await this.save();
    }
}
