import { setting } from '@/server/config';
import { getCurrentUser } from '@/server/auth/session';
import { Settings } from '@/server/classes/Settings';
import { NotificationTemplate } from '@/server/models/NotificationTemplate';
import { Breadcrumb } from '../../components/Breadcrumb';
import { PreferencesTable, PushNotifications, type NotificationRow } from './NotificationsClient';

/** Port of views/client/account/notifications.blade.php + Livewire\Client\Notifications::notifications() */
export default async function Notifications() {
    const user = (await getCurrentUser())!;
    const userPreferences = await user.rel('notificationsPreferences');
    const templates = await NotificationTemplate.query()
        .where('enabled', true)
        .where((q) => {
            // If they are both force, or force and never, they are not user configurable
            q.where('mail_enabled', '!=', 'force').orWhere('in_app_enabled', '!=', 'force');
        })
        .whereNotIn('key', ['email_verification', 'password_reset', 'new_login_detected'])
        .get();

    const rows: NotificationRow[] = [];
    const initial: Record<string, { mail_enabled: boolean; in_app_enabled: boolean }> = {};
    for (const template of templates) {
        const preference = userPreferences.find((p) => p.notification_template_id === template.id) ?? null;
        rows.push({ key: template.key as string, name: template.edit_preference_message as string, mailControllable: template.isEmailUserControllable(), inAppControllable: template.isInAppUserControllable() });
        initial[template.key as string] = {
            mail_enabled: template.isEnabledForPreference(preference as any, 'mail'),
            in_app_enabled: template.isEnabledForPreference(preference as any, 'app'),
        };
    }
    const supportsPush = await Settings.validateOrCreateVapidKeys();

    return (
        <div className="container mt-14">
            <Breadcrumb />

            <div className="px-2">
                {/* Configure push notifications */}
                {supportsPush && <PushNotifications vapidPublicKey={String(setting('vapid_public_key') ?? '')} />}
                <PreferencesTable rows={rows} initial={initial} />
            </div>
        </div>
    );
}
