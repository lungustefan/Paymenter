'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Ri } from '@/components/icons/Ri';
import { Dropdown } from './Dropdown';
import { useT } from './Providers';
import { cn } from './cn';
import { markNotificationRead, openNotification } from '@/actions/shell';

export interface NotificationItem {
    id: number;
    title: string;
    body: string;
    read: boolean;
    createdHuman: string;
}

/** Port of Livewire\Components\Notifications + components/notifications.blade.php */
export function NotificationsMenu({ notifications }: { notifications: NotificationItem[] }) {
    const router = useRouter();
    const { t } = useT();
    const [, startTransition] = useTransition();
    const [hasNew, setHasNew] = useState(false);
    const unread = notifications.filter((n) => !n.read).length;

    useEffect(() => {
        const handler = () => {
            setHasNew(true);
            router.refresh(); // `notification-added` re-renders the list
        };
        window.addEventListener('new-notification', handler);
        return () => window.removeEventListener('new-notification', handler);
    }, [router]);

    return (
        <div>
            <Dropdown
                width="w-84"
                showArrow={false}
                trigger={
                    <div className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral cursor-pointer transition" onClick={() => setHasNew(false)}>
                        <Ri name="notification-3-fill" className={cn('size-4', hasNew && 'animate-wiggle')} />
                        {unread > 0 && (
                            <span className="absolute top-0 right-0 w-4 h-4 inline-flex items-center justify-center text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">{unread}</span>
                        )}
                    </div>
                }
            >
                <div className="w-full max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-base/80">{t('No new notifications')}</div>
                    ) : (
                        notifications.map((n, i) => (
                            <div
                                key={n.id}
                                onClick={() =>
                                    startTransition(async () => {
                                        const res = await openNotification(n.id);
                                        if (res.data?.url) window.location.href = res.data.url;
                                        else router.refresh();
                                    })
                                }
                                className={cn('block px-4 py-3 hover:bg-background-secondary/50 cursor-pointer', i !== notifications.length - 1 && 'border-b border-neutral/50')}
                            >
                                <div className="flex items-start gap-3">
                                    <Ri name="notification-3-fill" className={cn('size-5 mt-1 flex-shrink-0', n.read ? 'text-base/80' : 'text-primary')} />
                                    <div className="flex flex-col">
                                        <span className="font-medium">{n.title}</span>
                                        <span className="text-sm text-base/80">{n.body}</span>
                                        <div className="flex flex-row justify-between mt-1 text-xs text-base/60">
                                            <p>{n.createdHuman}</p>
                                            <button
                                                className="cursor-pointer"
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startTransition(async () => {
                                                        await markNotificationRead(n.id);
                                                        router.refresh();
                                                    });
                                                }}
                                            >
                                                {t('Mark as read')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Dropdown>
        </div>
    );
}
