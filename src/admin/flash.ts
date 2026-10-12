import { sessionGet } from '@/server/session';
import type { NotificationData } from './Notification';

/** notifications queued in the session (`filament.notifications`) by code that ran outside an action */
export async function consumeFlashedNotifications(): Promise<NotificationData[]> {
    try {
        const queue = await sessionGet<any[]>('filament.notifications', []);
        return queue.map((n) => ({ id: n.id, title: n.title, body: n.body, status: n.status ?? 'info', duration: n.duration, persistent: n.persistent }));
    } catch {
        return [];
    }
}
