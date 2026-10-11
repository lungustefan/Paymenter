import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { cartItems } from '@/server/db/schema';
import { Price } from '@/server/classes/Price';
import { setting } from '@/server/config';
import type { Row } from './_types';
import { Cart } from './Cart';
import { Plan } from './Plan';
import { Product } from './Product';
import { sessionCurrency } from './_plans';
import { CartItemObserver } from '@/server/observers/CartItemObserver';

export interface CartItem extends Row<typeof cartItems> {}

interface SelectedOption {
    option_id: number;
    value?: unknown;
    [k: string]: unknown;
}

export class CartItem extends Model<{ cart: Cart; plan: Plan; product: Product }> {
    static table = cartItems;
    static morphName = 'App\\Models\\CartItem';
    static fillable = ['cart_id', 'product_id', 'plan_id', 'config_options', 'checkout_config', 'quantity'];
    static observers = [CartItemObserver];
    static accessors = ['price'];
    // `price` is only an accessor on this model (there is no price column)

    static relations: Record<string, RelationDef> = {
        cart: belongsTo(() => Cart, 'cart_id'),
        plan: belongsTo(() => Plan, 'plan_id'),
        product: belongsTo(() => Product, 'product_id'),
    };

    /**
     * The calculated price of this item, including selected config options, setup
     * fees, coupon discount and exclusive tax.
     */
    async price(): Promise<Price> {
        const cart = await this.rel('cart');
        const plan = await this.rel('plan');
        const product = await this.rel('product');
        // Resolve against the cart's currency: the invoice inherits it, while the session may have expired back to the default currency.
        const currency = cart?.currency_code ?? (await sessionCurrency());
        let total = 0;
        let setupFee = 0;
        let unavailable = false;

        const base = await plan.price(currency);
        total += base.price;
        setupFee += base.setup_fee ?? 0;

        const selectedOptions = ((this.config_options as SelectedOption[] | null) ?? []);
        for (const option of await product.rel('configOptions')) {
            const selected = selectedOptions.find((o) => String(o.option_id) === String(option.id)) as SelectedOption | undefined;

            // If checkbox and selected, add price of first child (only one)
            if (option.type === 'checkbox' && selected?.value) {
                const child = (await option.rel('children'))[0];
                const childPrice = child
                    ? await child.price(null, plan.billing_period, plan.billing_unit, currency)
                    : undefined;
                if (childPrice) {
                    unavailable = unavailable || !childPrice.available;
                    total += childPrice.price;
                    setupFee += childPrice.setup_fee ?? 0;
                }
                continue;
            }

            // Skip text, number and checkbox types as they have no price
            if (['text', 'number', 'checkbox'].includes(option.type ?? '')) continue;

            if (!selected || selected.value === undefined || selected.value === null) continue;

            const child = (await option.rel('children')).find((c) => String(c.id) === String(selected.value));
            const childPrice = child ? await child.price(null, plan.billing_period, plan.billing_unit, currency) : undefined;
            if (childPrice) {
                unavailable = unavailable || !childPrice.available;
                total += childPrice.price;
                setupFee += childPrice.setup_fee ?? 0;
            }
        }

        // A paid option without a price row must make the whole item unavailable, not contribute 0.
        if (unavailable) return Price.make({ price: null, setup_fee: null, currency: null });

        const price = await Price.make(
            { price: total, currency: base.currency, setup_fee: setupFee },
            { apply_exclusive_tax: true },
        );

        const coupon = cart?.coupon_id ? await cart.rel('coupon') : null;
        if (!cart?.coupon_id || !coupon) return price;

        const couponProducts = await coupon.rel('products');
        if (couponProducts.length > 0 && !couponProducts.some((p) => p.id === this.product_id)) return price;

        const pdiscount = coupon.calculateDiscount(price.price);
        const sdiscount = coupon.calculateDiscount(price.setup_fee ?? 0, 'setup_fee');
        price.price -= pdiscount;
        price.setup_fee = (price.setup_fee ?? 0) - sdiscount;
        price.setDiscount(pdiscount + sdiscount);
        return price;
    }
}
void setting;
