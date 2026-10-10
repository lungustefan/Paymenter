import { forgetCookie, hasCookie, setCookie } from '@/server/cookies';
import { Cart } from '@/server/cart';

/** Port of App\Listeners\UserAuthListener */
export async function onLoginCart({ user }: { user: any }) {
    // Does request have cart?
    if (await hasCookie('cart')) {
        // Merge cart with user
        const cart = await Cart.getOnce();
        if (cart.$exists) {
            cart.user_id = user.id;
            await cart.save();
        }
    } else {
        const existing = await user.rel('cart');
        // Set cart to user
        if (existing) await setCookie('cart', existing.ulid, { minutes: 60 * 24 * 30 }); // 30 days
    }
}

export async function onLogoutCart() {
    // Does request have cart? Remove cart from user
    if (await hasCookie('cart')) await forgetCookie('cart');
}
