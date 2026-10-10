import { once, forgetOnce } from '@/server/request-store';
import { RateLimiter } from '@/server/cache';
import { transaction } from '@/server/orm';
import { setting } from '@/server/config';
import { getRequestInfo } from '@/server/request';
import { forgetCookie, getCookie, setCookie } from '@/server/cookies';
import { sessionGet } from '@/server/session';
import { DisplayException } from '@/server/exceptions';
import { Cart as CartModel } from '@/server/models/Cart';
import { Coupon } from '@/server/models/Coupon';
import type { Plan } from '@/server/models/Plan';
import type { Product } from '@/server/models/Product';
import type { CartItem } from '@/server/models/CartItem';
import { getCurrentUserId } from '@/server/auth/session';

/** Port of App\Classes\Cart (the request's shopping cart, referenced by the `cart` cookie). */

const EAGER = ['items.plan', 'items.product', 'items.product.configOptions.children.plans.prices'];

const MAX_ITEMS = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_DECAY_MINUTES = 1;

export class Cart {
    /** Load the cart for this request (a new, unsaved cart when there is none). */
    static async getOnce(): Promise<CartModel> {
        const ulid = await getCookie('cart');
        if (!ulid) return new CartModel();
        const cart = await CartModel.query().where('ulid', ulid).first();
        if (!cart) return new CartModel();
        await cart.load(...EAGER);
        return cart;
    }

    /** Memoised per request - `Cart::get()` */
    static get(): Promise<CartModel> {
        return once('cart', () => Cart.getOnce());
    }

    static async refresh(): Promise<void> {
        await forgetOnce('cart');
    }

    static async clear(): Promise<void> {
        const ulid = await getCookie('cart');
        if (ulid) {
            await CartModel.query().where('ulid', ulid).delete();
            await forgetCookie('cart');
        }
        await forgetOnce('cart');
    }

    static async items(): Promise<CartItem[]> {
        return (await Cart.get()).rel('items');
    }

    static async createCart(): Promise<CartModel> {
        let cart = await Cart.getOnce();
        if (!cart.$exists) {
            cart.user_id = await getCurrentUserId();
            cart.currency_code = (await sessionGet<string | null>("currency", setting("default_currency"))) as string;
            await cart.save();
            await setCookie('cart', cart.ulid, { minutes: 60 * 24 * 30 }); // 30 days
            cart = (await CartModel.find<CartModel>(cart.id))!;
            await forgetOnce('cart');
        }
        return cart;
    }

    static async add(product: Product, plan: Plan, configOptions: unknown, checkoutConfig: unknown, quantity = 1, key: number | null = null): Promise<number> {
        await Cart.checkRateLimit();

        // Match on key
        const cart = await Cart.createCart();
        await Cart.ensureCartItemLimit(cart, key);

        const item = await cart.relation<CartItem>('items').updateOrCreate(
            { id: key },
            {
                product_id: product.id,
                plan_id: plan.id,
                config_options: configOptions,
                checkout_config: checkoutConfig,
                quantity,
            },
        );

        await cart.load(...EAGER);
        if (cart.coupon_id) {
            // Reapply coupon to the cart
            try {
                const coupon = (await cart.rel('coupon'))!;
                await Cart.validateCoupon(coupon.code);
                // Check if any of the items have gotten a discount
                let discounted = false;
                for (const i of await cart.rel('items')) if ((await i.price()).hasDiscount()) discounted = true;
                if (!discounted) {
                    cart.coupon_id = null;
                    await cart.save();
                }
            } catch (e) {
                if (!(e instanceof DisplayException)) throw e;
                // Coupon is invalid, remove it
                cart.coupon_id = null;
                await cart.save();
            }
        }
        await forgetOnce('cart');

        // Return index of the newly added item
        return item.id;
    }

    protected static async ensureCartItemLimit(cart: CartModel, key: number | null = null) {
        const existing = key ? await cart.relation('items').where('id', key).exists() : false;
        if (!existing && (await cart.relation('items').count()) >= MAX_ITEMS) {
            throw new DisplayException(`Your cart cannot contain more than ${MAX_ITEMS} items.`);
        }
    }

    protected static async checkRateLimit() {
        const userId = await getCurrentUserId();
        const key = userId ? `cart-add:user:${userId}` : `cart-add:ip:${(await getRequestInfo()).ip}`;
        if (await RateLimiter.tooManyAttempts(key, RATE_LIMIT_MAX_ATTEMPTS)) {
            throw new DisplayException('You are adding items too quickly. Please wait a moment and try again.');
        }
        await RateLimiter.hit(key, RATE_LIMIT_DECAY_MINUTES * 60);
    }

    static async remove(index: number): Promise<void> {
        const cart = await Cart.get();
        const item = await cart.relation<CartItem>('items').where('id', index).first();
        if (item) await item.delete(); // We also want to trigger Eloquent events
        await forgetOnce('cart');
    }

    static async updateQuantity(index: number, quantity: number): Promise<void> {
        const cart = await Cart.get();
        const item = await cart.relation<CartItem>('items').where('id', index).first();
        if (!item) return;
        const product = (await item.rel('product'))!;
        if (product.allow_quantity !== 'combined') return;
        if (quantity < 1) {
            await Cart.remove(index);
            return;
        }
        item.quantity = quantity;
        await item.save();
        await forgetOnce('cart');
    }

    static async validateCoupon(code: string): Promise<Coupon> {
        return transaction(async () => {
            const coupon = await Coupon.query().where('code', code).lockForUpdate().first();
            if (!coupon) throw new DisplayException('Coupon code not found');
            if (coupon.expires_at && coupon.expires_at.isPast()) throw new DisplayException('Coupon code has expired');
            if (coupon.starts_at && coupon.starts_at.isFuture()) throw new DisplayException('Coupon code is not active yet');
            if (coupon.max_uses && (await coupon.relation('services').count()) >= coupon.max_uses) {
                throw new DisplayException('Coupon code has reached its maximum uses');
            }
            const userId = await getCurrentUserId();
            if (userId && (await coupon.hasExceededMaxUsesPerUser(userId))) {
                throw new DisplayException('You have already used this coupon the maximum number of times allowed');
            }
            const products = await coupon.rel('products');
            if (products.length > 0) {
                const cart = await Cart.get();
                const applicable = (await cart.rel('items')).some((i) => products.some((p) => p.id === i.product_id));
                if (!applicable) throw new DisplayException('Coupon code is not valid for any items in your cart');
            }
            return coupon;
        });
    }

    static async applyCoupon(code: string): Promise<CartModel> {
        const ip = (await getRequestInfo()).ip;
        if (await RateLimiter.tooManyAttempts(`apply_coupon_${ip}`, 5)) throw new DisplayException('Too many attempts. Please try again later.');
        await RateLimiter.hit(`apply_coupon_${ip}`);

        const coupon = await Cart.validateCoupon(code);
        const cart = await Cart.createCart();
        cart.coupon_id = coupon.id;
        await cart.save();
        await cart.load('coupon', ...EAGER);

        // Check if any of the items have gotten a discount; if empty also succeed because the coupon is valid for future use (re-checked on checkout)
        const items = await cart.rel('items');
        let discounted = false;
        for (const i of items) if ((await i.price()).hasDiscount()) discounted = true;

        if (discounted || items.length === 0) {
            await cart.save();
            await forgetOnce('cart');
            return cart;
        }
        cart.coupon_id = null;
        await cart.save();
        throw new DisplayException('Coupon code is not valid for any items in your cart');
    }

    static async validateAndRefreshCoupon(): Promise<boolean> {
        const cart = await Cart.get();
        const coupon = cart.coupon_id ? await cart.rel('coupon') : null;
        if (!cart.coupon_id || !coupon) return true;
        try {
            await Cart.validateCoupon(coupon.code);
            return true;
        } catch (e) {
            if (!(e instanceof DisplayException)) throw e;
            // Coupon is invalid, remove it
            await Cart.removeCoupon();
            return false;
        }
    }

    static async removeCoupon(): Promise<void> {
        const cart = await Cart.get();
        await cart.update({ coupon_id: null });
        cart.unsetRelation('coupon');
    }
}
