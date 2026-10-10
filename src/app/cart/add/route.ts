import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { Cart } from '@/server/cart';
import { Product } from '@/server/models/Product';
import { getCheckoutConfigFields } from '@/server/pages/checkout';

/**
 * A product with a single plan and nothing to configure is added straight to the cart when its
 * checkout page is opened (Livewire\Products\Checkout::mount). Pages cannot set the cart cookie,
 * so this route does it and continues to the cart.
 */
export async function GET(request: NextRequest) {
    await initRequest();
    const id = request.nextUrl.searchParams.get('product');
    const product = id ? await Product.find<Product>(Number(id)) : null;
    if (!product) return NextResponse.redirect(new URL('/', request.nextUrl.origin));
    await product.load('plans.prices', 'configOptions.children.plans.prices');

    const plans = await product.rel('plans');
    const options = await product.rel('configOptions');
    const fields = await getCheckoutConfigFields(product, {});
    if (plans.length === 1 && options.length === 0 && fields.length === 0 && product.stock !== 0 && (await product.price()).available) {
        await Cart.add(product, plans[0], [], {}, 1, null);
        return NextResponse.redirect(new URL('/cart', request.nextUrl.origin));
    }
    const category = await product.rel('category');
    return NextResponse.redirect(new URL(`/products/${category?.slug}/${product.slug}/checkout`, request.nextUrl.origin));
}
