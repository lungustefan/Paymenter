'use client';

import { useEffect, useState } from 'react';
import { Ri } from '@/components/icons/Ri';
import { savePreferencesAction, storePushSubscriptionAction } from '@/actions/account';
import { PrimaryButton } from '../../components/Button';
import { Toggle } from '../../components/Form';
import { Loading } from '../../components/Loading';
import { useForm } from '../../components/useForm';
import { useNotify, useT } from '../../components/Providers';

export interface NotificationRow {
    key: string;
    name: string;
    mailControllable: boolean;
    inAppControllable: boolean;
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

/** Alpine `pushNotifications` of views/client/account/notifications.blade.php */
export function PushNotifications({ vapidPublicKey }: { vapidPublicKey: string }) {
    const { t } = useT();
    const notify = useNotify();
    const [status, setStatus] = useState<'unknown' | 'not_subscribed' | 'subscribed' | 'denied' | 'not_supported'>('unknown');

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.pushManager.getSubscription().then((subscription) => {
                    if (subscription) setStatus('subscribed');
                    else setStatus(Notification.permission === 'denied' ? 'denied' : 'not_subscribed');
                });
            });
        } else {
            setStatus('not_subscribed');
        }
    }, []);

    const store = async (subscription: PushSubscription) => {
        const res = await storePushSubscriptionAction(JSON.stringify(subscription));
        const notes = ((res.data as any)?.notes as { message: string; type: string }[]) ?? (res.notify ? [res.notify] : []);
        for (const n of notes) notify(n.message, n.type);
    };

    const subscribe = () => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.pushManager.getSubscription().then((subscription) => {
                    if (subscription) {
                        store(subscription);
                        setStatus('subscribed');
                        return;
                    }
                    // Subscribe the user
                    registration.pushManager
                        .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
                        .then((newSubscription) => {
                            store(newSubscription);
                            setStatus('subscribed');
                        })
                        .catch((e) => {
                            if (Notification.permission === 'denied') setStatus('denied');
                            else {
                                console.error('Failed to subscribe the user: ', e);
                                setStatus('not_subscribed');
                            }
                        });
                });
            });
        } else {
            setStatus('not_supported');
        }
    };

    return (
        <div className="bg-background-secondary rounded-lg p-4 mb-6">
            <h2 className="text-lg font-medium text-primary mb-2">{t('account.push_notifications')}</h2>
            <p className="text-base/70 mb-4">{t('account.push_notifications_description')}</p>
            <PrimaryButton type="button" className="!w-fit" onClick={subscribe} disabled={status !== 'not_subscribed'}>
                <Ri name="notification-line" className="size-5" />
                {t('account.enable_push_notifications')}
            </PrimaryButton>
            {status !== 'unknown' && (
                <div>
                    {status === 'not_supported' && <p className="text-sm text-red-600">{t('account.push_status.not_supported')}</p>}
                    {status === 'denied' && <p className="text-sm text-red-600">{t('account.push_status.denied')}</p>}
                    {status === 'subscribed' && <p className="text-sm text-green-600">{t('account.push_status.subscribed')}</p>}
                </div>
            )}
        </div>
    );
}

/** Preferences table + save button */
export function PreferencesTable({ rows, initial }: { rows: NotificationRow[]; initial: Record<string, { mail_enabled: boolean; in_app_enabled: boolean }> }) {
    const { t } = useT();
    const form = useForm({ preferences: initial });
    const [saving, setSaving] = useState(false);

    const set = (key: string, field: 'mail_enabled' | 'in_app_enabled', value: boolean) =>
        form.set('preferences', { ...form.data.preferences, [key]: { ...form.data.preferences[key], [field]: value } });

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full bg-background-secondary rounded-lg">
                    <thead>
                        <tr className="border-b border-neutral/20">
                            <th className="text-left py-4 px-6 text-primary font-medium">
                                {t('account.notification')}
                                <p className="text-sm text-base/70 font-normal mt-1">{t('account.notifications_description')}</p>
                            </th>
                            <th className="text-center py-4 px-4 text-primary font-medium">
                                <div className="flex items-center justify-center gap-2">
                                    <Ri name="mail-line" className="size-4" />
                                    <span>{t('account.email_notifications')}</span>
                                </div>
                            </th>
                            <th className="text-center py-4 px-4 text-primary font-medium">
                                <div className="flex items-center justify-center gap-2">
                                    <Ri name="notification-line" className="size-4" />
                                    <span>{t('account.in_app_notifications')}</span>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.key} className="border-b border-neutral/10 hover:bg-background/50 transition-colors">
                                <td className="py-4 px-6 text-base/70">{row.name}</td>
                                <td className="py-4 px-4">
                                    <div className="flex justify-center items-center">
                                        <Toggle id={`${row.key}-mail`} disabled={!row.mailControllable} checked={!!form.data.preferences[row.key]?.mail_enabled} onChange={(e) => set(row.key, 'mail_enabled', e.target.checked)} />
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex justify-center items-center">
                                        <Toggle id={`${row.key}-app`} disabled={!row.inAppControllable} checked={!!form.data.preferences[row.key]?.in_app_enabled} onChange={(e) => set(row.key, 'in_app_enabled', e.target.checked)} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <PrimaryButton
                onClick={() => {
                    setSaving(true);
                    form.run(() => savePreferencesAction(form.data.preferences), () => setSaving(false));
                }}
                className="w-full mt-6"
                disabled={saving}
            >
                <Loading show={saving} />
                {!saving && <span>{t('general.save')}</span>}
            </PrimaryButton>
        </>
    );
}
