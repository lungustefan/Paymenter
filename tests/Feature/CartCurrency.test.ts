import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { Browser } from '../helpers/http';
import { createProduct } from '../helpers/factories';
import { sessionPut } from '@/server/session';
import { Cart } from '@/server/models/Cart';
import { CartItem } from '@/server/models/CartItem';
import { Currency } from '@/server/models/Currency';

describe('CartCurrency', () => {
    useDatabase();

    let product: Awaited<ReturnType<typeof createProduct>>;
    let browser: Browser;

    beforeEach(async () => {
        product = await createProduct();
        browser = new Browser();
    });

    async function makeCartWithItem(currency: string) {
        const cart = await Cart.create({ currency_code: currency });
        await cart.relation<CartItem>('items').create({
            product_id: product.product.id,
            plan_id: product.plan.id,
            config_options: [],
            checkout_config: [],
            quantity: 1,
        });
        return (await Cart.find<Cart>(cart.id))!;
    }

    /** the price of the cart's first item, evaluated in a request whose session currency is `sessionCurrency` */
    async function priceInSession(cart: Cart, sessionCurrency: string) {
        const { value } = await browser.request(async () => {
            await sessionPut('currency', sessionCurrency);
            const item = (await cart.rel('items'))[0];
            return item.price();
        });
        return value!;
    }

    it('prices an item in the cart currency when the session diverges', async () => {
        await Currency.create({ code: 'EUR', name: 'Euro', suffix: 'EUR', format: '1.000,00' });
        await product.plan.relation('prices').create({ price: 100.0, currency_code: 'EUR' });

        // Cart stamped USD, then the session diverges (e.g. expired back to the default currency).
        const cart = await makeCartWithItem('USD');
        const price = await priceInSession(cart, 'EUR');

        expect(price.currency?.code).toBe('USD');
        expect(Number(price.price)).toBe(10.0);
    });

    it('treats an item without a price row in the cart currency as unavailable', async () => {
        await Currency.create({ code: 'EUR', name: 'Euro', suffix: 'EUR', format: '1.000,00' });

        // Cart locked to EUR, but the plan is only priced in USD: must be unavailable, not free.
        const cart = await makeCartWithItem('EUR');
        const price = await priceInSession(cart, 'USD');

        expect(price.available).toBe(false);
        expect(Number(price.price)).toBe(0.0);
    });
});
