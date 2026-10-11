import { Model, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { notificationTemplates } from '@/server/db/schema';
import { NotificationEnabledStatus } from '@/server/enums';
import type { Row } from './_types';
import { NotificationPreference } from './NotificationPreference';

export interface NotificationTemplate extends Row<typeof notificationTemplates> {}

export class NotificationTemplate extends Model<{ preferences: NotificationPreference[] }> {
    static table = notificationTemplates;
    static morphName = 'App\\Models\\NotificationTemplate';
    static fillable = [
        'key', 'name', 'subject', 'enabled', 'body', 'cc', 'bcc', 'mail_enabled', 'in_app_enabled', 'in_app_title', 'in_app_body',
        'edit_preference_message',
    ];
    static casts = { enabled: 'boolean' };
    static auditable = true;

    static relations: Record<string, RelationDef> = { preferences: hasMany(() => NotificationPreference, 'notification_template_id') };

    isEmailUserControllable(): boolean {
        return ([NotificationEnabledStatus.ChoiceOn, NotificationEnabledStatus.ChoiceOff] as string[]).includes(this.mail_enabled);
    }

    isInAppUserControllable(): boolean {
        return ([NotificationEnabledStatus.ChoiceOn, NotificationEnabledStatus.ChoiceOff] as string[]).includes(this.in_app_enabled);
    }

    /** Is this notification enabled, given the user's saved preference? */
    isEnabledForPreference(preference: NotificationPreference | null = null, type: 'mail' | 'app' = 'mail'): boolean {
        const field = type === 'app' ? 'in_app_enabled' : 'mail_enabled';
        const mode = this[field];
        if (mode === NotificationEnabledStatus.Force) return true;
        if (mode === NotificationEnabledStatus.Never) return false;
        if (preference) return !!preference[field];
        // true if choice_on, false if choice_off
        return mode === NotificationEnabledStatus.ChoiceOn;
    }
}
