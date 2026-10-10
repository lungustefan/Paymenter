import { transaction } from '@/server/orm';
import { Cart } from '@/server/cart';
import { DisplayException } from '@/server/exceptions';
import { Price } from '@/server/classes/Price';
import { Carbon } from '@/server/lib/carbon';
import { dispatchJob } from '@/server/queue';
import { t } from '@/server/i18n';
import { User } from '@/server/models/User';
import { Product } from '@/server/models/Product';
import { Order } from '@/server/models/Order';
import { Invoice } from '@/server/models/Invoice';
import { Service } from '@/server/models/Service';
import { route } from '@/server/routes';
import { getLocale } from '@/server/page';

/** Total of the cart: sum of `price.total * quantity` of every item. */
export async function cartTotal(): Promise<Price | null> {
    const cart = await Cart.get();
    const items = await Cart.items();
    if (items.length === 0) return null;
    let sum = 0;
    for (const item of items) sum += Number((await item.price()).total) * Number(item.quantity);
    return Price.make({ price: sum, currency: await cart.rel('currency') });
}

/**
 * The checkout of Livewire\Cart: turns the cart into an order (+ invoice + services) inside a
 * database transaction. Returns the URL to continue at. Throws DisplayException for problems the
 * customer should see.
 */
export async function checkoutCart(userId: number): Promise<{ redirect: string }> {
    const locale = await getLocale();
    const cart = await Cart.get();
    const total = (await cartTotal())!;

    const outcome = await transaction(async () => {
        const user = (await User.query().where('id', userId).lockForUpdate().first())!;
        const coupon = cart.coupon_id ? await cart.rel('coupon') : null;
        if (coupon && !(await Cart.validateAndRefreshCoupon())) throw new DisplayException('This coupon can no longer be used');

        const items = await Cart.items();

        // Lock the order products
        for (const item of items) {
            const itemProduct = (await item.rel('product'))!;
            // An item without a price row in the cart's currency would otherwise check out free.
            if (!(await item.price()).available) throw new DisplayException(t('product.not_available', { product: itemProduct.name }, locale));

            // Make sure we have the latest product data and lock it
            const product = (await Product.query().where('id', itemProduct.id).lockForUpdate().first())!;
            if ((product.per_user_limit as number) > 0) {
                const existing = await user.relation('services').where('product_id', product.id).count();
                const inCart = items.filter((i) => i.product_id === product.id).reduce((s, i) => s + Number(i.quantity), 0);
                if (existing >= (product.per_user_limit as number) || inCart + existing > (product.per_user_limit as number)) {
                    throw new DisplayException(t('product.user_limit', { product: product.name }, locale));
                }
            }
            if (product.stock !== null && product.stock !== undefined) {
                if ((product.stock as number) < Number(item.quantity)) throw new DisplayException(t('product.out_of_stock', { product: product.name }, locale));
                product.stock = (product.stock as number) - Number(item.quantity);
                await product.save();
            }
        }

        // Create the order
        const order = new Order({ user_id: user.id, currency_code: cart.currency_code });
        await order.save();

        // Create the invoice
        let invoice: Invoice | null = null;
        if (total.price > 0) {
            invoice = new Invoice({ user_id: user.id, due_at: Carbon.now().addDays(7), currency_code: cart.currency_code });
            await invoice.save();
        }

        // Create the services
        const services: Service[] = [];
        for (const item of items) {
            const price = await item.price();
            const itemProduct = (await item.rel('product'))!;
            const itemPlan = (await item.rel('plan'))!;

            // Is it a lifetime coupon, then we can adjust the price of the service
            const recurring = coupon ? (coupon.recurring as number | null) : undefined;
            const finalPrice = coupon && (recurring === null || Number(recurring) === 1) ? price.original_price : price.price;

            const service = await order.relation<Service>('services').create({
                user_id: user.id,
                currency_code: cart.currency_code,
                product_id: itemProduct.id,
                plan_id: itemPlan.id,
                price: finalPrice,
                quantity: item.quantity,
                coupon_id: cart.coupon_id,
            });
            services.push(service);

            for (const [key, value] of Object.entries((item.checkout_config as Record<string, unknown>) ?? {})) {
                await service.relation('properties').updateOrCreate({ key }, { value });
            }

            for (const configOption of ((item.config_options as any[]) ?? [])) {
                if (['text', 'number'].includes(configOption.option_type)) {
                    if (configOption.value === undefined || configOption.value === null) continue;
                    await service.relation('properties').updateOrCreate(
                        { key: configOption.option_env_variable ? configOption.option_env_variable : configOption.option_name },
                        { name: configOption.option_name, value: configOption.value },
                    );
                    continue;
                }
                if (configOption.value === undefined || configOption.value === null) continue;
                await service.relation('configs').create({ config_option_id: configOption.option_id, config_value_id: configOption.value });
            }

            // Create the invoice items
            if (Number(price.total) > 0) {
                await invoice!.relation('items').create({
                    reference_id: service.id,
                    reference_type: 'App\\Models\\Service',
                    price: price.total,
                    quantity: item.quantity,
                    description: await service.description(),
                });
            } else {
                // We'll make the service active immediately
                if (itemProduct.server_id) await dispatchJob('server.create', { service });
                service.status = Service.STATUS_ACTIVE;
                service.expires_at = await service.calculateNextDueDate();
                await service.save();
            }
        }

        return { order, invoice, services };
    });

    // Clear the cart
    await Cart.clear();

    if (Number(total.price) === 0) {
        // Is it only one item? Then redirect to the service page
        if (outcome.services.length === 1) return { redirect: route('services.show', outcome.services[0], false) };
        return { redirect: route('services', {}, false) };
    }
    return { redirect: route('invoices.show', { invoice: outcome.invoice, pay: 1 }, false) };
}
