import { sessionGet, sessionPut } from '@/server/session';
import { uuid } from '@/server/lib/ids';

/**
 * `Filament\Notifications\Notification::make()->...->send()`: notifications are kept in the
 * session (`filament.notifications`) and shown by the admin panel on its next render.
 */
export interface AdminNotification {
    title: string;
    body?: string;
    status?: 'success' | 'danger' | 'warning' | 'info';
    /** milliseconds; Filament's default is 6000 */
    duration?: number;
    persistent?: boolean;
}

export async function sendAdminNotification(notification: AdminNotification): Promise<void> {
    try {
        const queue = await sessionGet<any[]>('filament.notifications', []);
        queue.push({ id: uuid(), status: 'info', duration: 6000, ...notification, createdAt: Date.now() });
        await sessionPut('filament.notifications', queue);
    } catch {
        /* no session available (e.g. called from a job) */
    }
}

export const adminNotification = {
    success: (title: string, body?: string) => sendAdminNotification({ title, body, status: 'success' }),
    danger: (title: string, body?: string) => sendAdminNotification({ title, body, status: 'danger' }),
    warning: (title: string, body?: string) => sendAdminNotification({ title, body, status: 'warning' }),
    info: (title: string, body?: string) => sendAdminNotification({ title, body, status: 'info' }),
};
