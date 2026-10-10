import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { useDatabase } from '../helpers/db';
import { Browser } from '../helpers/http';
import { createProduct } from '../helpers/factories';
import CategoryPage from '@/app/products/[category]/page';
import ProductPage from '@/app/products/[category]/[product]/page';
import CheckoutPage from '@/app/products/[category]/[product]/checkout/page';
import { GET as cartAdd } from '@/app/cart/add/route';
import { addToCartAction, pricingAction } from '@/actions/checkout';
import { Cart as CartService } from '@/server/cart';
import { getCookie } from '@/server/cookies';
import { Cart } from '@/server/models/Cart';
import { CartItem } from '@/server/models/CartItem';
import type { Category } from '@/server/models/Category';

describe('Checkout', () => {
    useDatabase();

    let product: Awaited<ReturnType<typeof createProduct>>;
    let category: Category;
    let browser: Browser;

    beforeEach(async () => {
        product = await createProduct();
        category = (await product.product.rel('category'))!;
        browser = new Browser();
    });

    const params = <T extends Record<string, string>>(p: T) => Promise.resolve(p);
    const productParams = () => ({ category: category.slug as string, product: product.product.slug as string });
    /** the props a themed page passes to its view */
    const viewProps = (element: any) => element.props.props;

    async function addSecondPlan() {
        const plan = await product.product.relation('plans').create({ name: 'Test Plan 2', billing_unit: 'month', billing_period: 1, type: 'recurring' });
        await plan.relation('prices').create({ price: 20.0, currency_code: 'USD' });
        return plan;
    }

    it('shows the product on the category overview page', async () => {
        const { value } = await browser.request(() => CategoryPage({ params: params({ category: category.slug as string }), searchParams: Promise.resolve({}) }));

        expect(viewProps(value).products.map((p: any) => p.name)).toContain(product.product.name);
    });

    it('shows the product on the product page', async () => {
        const { value } = await browser.request(() => ProductPage({ params: params(productParams()), searchParams: Promise.resolve({}) }));

        expect(viewProps(value).product.name).toBe(product.product.name);
    });

    it('redirects the checkout page to the cart if there is one plan', async () => {
        const result = await browser.request(() => CheckoutPage({ params: params(productParams()), searchParams: Promise.resolve({}) }));
        expect(result.redirect).toBe(`/cart/add?product=${product.product.id}`);

        // following the redirect adds the item to a new cart and sends the visitor to the cart
        const added = await browser.request(async () => cartAdd(new NextRequest(`http://localhost/cart/add?product=${product.product.id}`)));
        expect(new URL(added.value!.headers.get('location')!).pathname).toBe('/cart');

        const cart = (await Cart.query().where('currency_code', 'USD').first())!;
        expect(cart).not.toBeNull();
        expect(await cart.relation('items').first()).not.toBeNull();
        expect((await browser.request(() => getCookie('cart'))).value).toBe(cart.ulid);

        // the cart page shows the product
        const { value: items } = await browser.request(() => CartService.items());
        expect(items!).toHaveLength(1);
        expect((await items![0].rel('product'))!.name).toBe(product.product.name);

        expect(await Cart.query().where('currency_code', 'USD').exists()).toBe(true);
        expect(await CartItem.query().where('cart_id', cart.id).where('product_id', product.product.id).where('plan_id', product.plan.id).exists()).toBe(true);
    });

    it('shows the checkout page with multiple plans', async () => {
        await addSecondPlan();

        const { value, redirect } = await browser.request(() => CheckoutPage({ params: params(productParams()), searchParams: Promise.resolve({}) }));

        expect(redirect).toBeUndefined();
        expect(viewProps(value).data.product.name).toBe(product.product.name);
        expect(viewProps(value).data.plans).toHaveLength(2);
    });

    it('prices and adds a changed plan to the cart', async () => {
        const plan = await addSecondPlan();
        const input = { ...productParams(), configOptions: {}, checkoutConfig: {} };

        const initial = (await browser.request(() => pricingAction({ ...input, planId: product.plan.id }))).value!;
        expect(initial.total).toBe('$10.00');

        const changed = (await browser.request(() => pricingAction({ ...input, planId: plan.id }))).value!;
        expect(changed.total).toBe('$20.00');

        const result = (await browser.request(() => addToCartAction({ ...input, planId: plan.id }))).value!;
        expect(result.ok).toBe(true);
        expect(result.redirect).toBe('/cart');
        expect(await Cart.query().where('currency_code', 'USD').exists()).toBe(true);
        expect(await CartItem.query().where('plan_id', plan.id).exists()).toBe(true);
    });

    it('rejects a plan that is not part of the product', async () => {
        await addSecondPlan();
        const other = await createProduct();

        const result = (await browser.request(() => addToCartAction({ ...productParams(), planId: other.plan.id, configOptions: {}, checkoutConfig: {} }))).value!;

        expect(result.ok).toBe(false);
        expect(result.errors?.plan_id).toBeDefined();
        expect(await Cart.query().exists()).toBe(false);
    });
});
