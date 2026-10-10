'use server';

import { redirect } from 'next/navigation';
import { action, type ActionResult } from '@/server/action';
import { initRequest, requireUser } from '@/server/page';
import { setting } from '@/server/config';
import { sessionPut } from '@/server/session';
import { logout } from '@/server/auth/session';
import { Cart } from '@/server/cart';
import { Notification } from '@/server/models/Notification';
import { validate } from '@/server/validation';
import { t } from '@/server/i18n';
import { revalidatePath } from 'next/cache';

/** Port of Livewire\Components\LocaleSwitch */
export async function setLocale(locale: string): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const allowed = setting<string[]>('allowed_languages', []);
        if (!allowed.includes(locale)) return { ok: false, notify: { message: 'The selected language is not available.', type: 'error' } };
        await sessionPut('locale', locale);
        revalidatePath('/', 'layout');
        return { ok: true, redirect: 'refresh' };
    });
}

export async function setCurrency(currency: string): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        await validate({ currentCurrency: currency }, { currentCurrency: 'required|exists:currencies,code' }, { locale });
        if ((await Cart.items()).length > 0) {
            return { ok: false, notify: { message: 'You cannot change the currency while there are items in the cart.', type: 'error' } };
        }
        await sessionPut('currency', currency);
        const cart = await Cart.get();
        if (cart.$exists) {
            cart.currency_code = currency;
            await cart.save();
        }
        revalidatePath('/', 'layout');
        return { ok: true, redirect: 'refresh' };
    });
}

/** Port of Livewire\Auth\Logout */
export async function logoutAction(): Promise<void> {
    await initRequest();
    await logout();
    redirect('/');
}

/** Livewire\Components\Notifications::markAsRead / goToNotification */
export async function markNotificationRead(id: number): Promise<ActionResult> {
    const user = await requireUser();
    const notification = await Notification.query().where('user_id', user.id).where('id', id).first();
    if (!notification) return { ok: false };
    await notification.markAsRead();
    revalidatePath('/', 'layout');
    return { ok: true };
}

export async function openNotification(id: number): Promise<ActionResult<{ url: string | null }>> {
    const user = await requireUser();
    const notification = await Notification.query().where('user_id', user.id).where('id', id).first();
    if (!notification) return { ok: false };
    await notification.markAsRead();
    revalidatePath('/', 'layout');
    return { ok: true, data: { url: notification.url ?? null } };
}

void t;
