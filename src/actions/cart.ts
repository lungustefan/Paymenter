'use server';

import { redirect } from 'next/navigation';
import { action, type ActionResult } from '@/server/action';
import { initRequest } from '@/server/page';
import { Cart } from '@/server/cart';
import { setting } from '@/server/config';
import { DisplayException } from '@/server/exceptions';
import { getAuthUser, getCurrentUser } from '@/server/auth/session';
import { checkoutCart } from '@/server/services/checkout/CartCheckout';
import { route, relativeUrl } from '@/server/routes';

/** Port of the actions of Livewire\Cart */

export async function applyCouponAction(code: string | null): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        if (code && (await Cart.get()).coupon_id) return { ok: false, notify: { message: 'Coupon code already applied', type: 'error' } };
        try {
            await Cart.applyCoupon(code ?? '');
        } catch (e) {
            if (e instanceof DisplayException) return { ok: false, notify: { message: e.message, type: 'error' }, redirect: 'refresh' };
            throw e;
        }
        return { ok: true, notify: { message: 'Coupon code applied successfully', type: 'success' }, redirect: 'refresh' };
    });
}

export async function removeCouponAction(): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        if (!(await Cart.get()).coupon_id) return { ok: false, notify: { message: 'No coupon code applied', type: 'error' } };
        await Cart.removeCoupon();
        return { ok: true, notify: { message: 'Coupon code removed successfully', type: 'success' }, redirect: 'refresh' };
    });
}

export async function removeProductAction(index: number): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        await Cart.remove(index);
        return { ok: true, redirect: 'refresh' };
    });
}

export async function updateQuantityAction(index: number, quantity: number): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        await Cart.updateQuantity(index, quantity);
        return { ok: true, redirect: 'refresh' };
    });
}

export async function checkoutAction(input: { tos: boolean }): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        if ((await Cart.items()).length === 0) return { ok: false, notify: { message: 'Your cart is empty', type: 'error' } };

        const user = await getCurrentUser();
        if (!user) redirect('/auth/guest?to=/cart');
        if (setting('mail_must_verify') && !user.hasVerifiedEmail()) redirect(relativeUrl(route('verification.notice')));
        if (setting('tos') && !input.tos) return { ok: false, notify: { message: 'You must accept the terms of service', type: 'error' } };

        try {
            const { redirect: to } = await checkoutCart(user.id as number);
            return { ok: true, redirect: to };
        } catch (e) {
            if (e instanceof DisplayException) return { ok: false, notify: { message: e.message, type: 'error' }, redirect: 'refresh' };
            console.error('[checkout]', e);
            return { ok: false, notify: { message: 'An error occurred while processing your order. Please try again later.', type: 'success' } };
        }
    });
}

void getAuthUser;
