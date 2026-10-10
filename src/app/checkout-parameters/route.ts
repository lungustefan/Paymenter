import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { sessionPut } from '@/server/session';
import { Cart } from '@/server/cart';
import { Currency } from '@/server/models/Currency';
import { DisplayException } from '@/server/exceptions';
import { safeIntended } from '@/server/auth/intended';

/**
 * `CheckoutParameterMiddleware`: `?currency=EUR` switches the currency and `?coupon=CODE` applies a
 * coupon. Pages cannot write cookies while rendering, so they bounce through this handler, which
 * applies the parameters and sends the visitor back to the same page without them.
 */
export async function GET(request: NextRequest) {
    await initRequest();
    const params = request.nextUrl.searchParams;
    const to = safeIntended(params.get('to')) ?? '/';

    const currency = params.get('currency');
    if (currency !== null) {
        const blocked = (await Cart.items()).length > 0 || !(await Currency.query().where('code', currency).exists());
        if (!blocked) await sessionPut('currency', currency);
    }

    const coupon = params.get('coupon');
    if (coupon !== null) {
        try {
            await Cart.applyCoupon(coupon);
        } catch (e) {
            if (!(e instanceof DisplayException)) throw e;
        }
    }

    return NextResponse.redirect(new URL(to, request.nextUrl.origin));
}
