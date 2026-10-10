import { decimalString } from '@/server/lib/php';
import { Cart as CartService } from '@/server/cart';
import { setting } from '@/server/config';
import { Settings } from '@/server/classes/Settings';
import { route, relativeUrl } from '@/server/routes';
import { cartTotal } from '@/server/services/checkout/CartCheckout';
import { CartView, type CartItemView } from './CartView';

/** Port of views/cart.blade.php */
export default async function Cart() {
    const cart = await CartService.get();
    const items = await CartService.items();
    const views: CartItemView[] = [];
    for (const item of items) {
        const product = (await item.rel('product'))!;
        const category = await product.rel('category');
        const price = await item.price();
        views.push({
            id: item.id as number,
            productName: product.name as string,
            options: ((item.config_options as any[]) ?? []).map((o) => ({ name: String(o.option_name), value: String(o.value_name ?? '') })),
            lineTotal: price.format(Number(price.total) * Number(item.quantity)),
            eachPrice: Number(item.quantity) > 1 ? String(price) : null,
            quantity: Number(item.quantity),
            allowQuantity: product.allow_quantity === 'combined',
            editUrl: relativeUrl(route('products.checkout', { category: category?.slug, product: product.slug, edit: item.id })),
        });
    }

    const total = await cartTotal();
    const tax = total ? await Settings.tax() : null;
    const coupon = cart.coupon_id ? await cart.rel('coupon') : null;

    return (
        <CartView
            items={views}
            coupon={coupon ? (coupon.code as string) : null}
            tos={setting<string | null>('tos') || null}
            totals={
                total
                    ? {
                          subtotal: total.format(total.subtotal),
                          tax: total.tax > 0 ? total.format(total.tax) : null,
                          taxName: (tax?.name as string) ?? '',
                          taxRate: decimalString(tax?.rate),
                          total: total.format(total.total),
                      }
                    : null
            }
        />
    );
}
