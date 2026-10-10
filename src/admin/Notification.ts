import { AsyncLocalStorage } from 'node:async_hooks';

export type NotificationStatus = 'success' | 'danger' | 'warning' | 'info' | null;

export interface NotificationData {
    id: string;
    title: string;
    body?: string;
    status: NotificationStatus;
    icon?: string | null;
    iconColor?: string | null;
    duration?: number | null;
    persistent?: boolean;
    actions?: { label: string; url?: string; openInNewTab?: boolean }[];
}

/**
 * Port of Filament\Notifications\Notification: `Notification::make()->title()->body()->success()->send()`.
 * Notifications sent while handling an action are returned to the browser with the action's result;
 * the ones sent while rendering a page are kept in the session until the next page shows them.
 */
const sink = new AsyncLocalStorage<NotificationData[]>();

export function collectNotifications<T>(fn: () => Promise<T>): Promise<{ result: T; notifications: NotificationData[] }> {
    const list: NotificationData[] = [];
    return sink.run(list, async () => ({ result: await fn(), notifications: list }));
}

export class Notification {
    private data: NotificationData = { id: Math.random().toString(36).slice(2), title: '', status: null };

    static make(): Notification {
        return new Notification();
    }

    title(title: string) {
        this.data.title = title;
        return this;
    }
    body(body: string) {
        this.data.body = body;
        return this;
    }
    success() {
        this.data.status = 'success';
        return this;
    }
    danger() {
        this.data.status = 'danger';
        return this;
    }
    warning() {
        this.data.status = 'warning';
        return this;
    }
    info() {
        this.data.status = 'info';
        return this;
    }
    icon(icon: string) {
        this.data.icon = icon;
        return this;
    }
    iconColor(color: string) {
        this.data.iconColor = color;
        return this;
    }
    duration(ms: number) {
        this.data.duration = ms;
        return this;
    }
    persistent() {
        this.data.persistent = true;
        return this;
    }
    actions(actions: NotificationData['actions']) {
        this.data.actions = actions;
        return this;
    }

    toData(): NotificationData {
        return { ...this.data };
    }

    async send(): Promise<this> {
        const list = sink.getStore();
        if (list) {
            list.push(this.toData());
        } else {
            // outside an action: shown on the next page render
            const { sendAdminNotification } = await import('@/server/admin/notifications');
            await sendAdminNotification({ title: this.data.title, body: this.data.body, status: this.data.status ?? 'info', persistent: this.data.persistent, duration: this.data.duration ?? undefined });
        }
        return this;
    }
}
