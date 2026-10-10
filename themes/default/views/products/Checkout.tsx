import { storageUrl } from '@/server/routes';
import { getLocale } from '@/server/page';
import { pricingView, computePricing, serializeConfigOptions, type LoadedCheckout } from '@/server/pages/checkout';
import { makeTranslator } from '@/server/i18n';
import { CheckoutForm } from './CheckoutForm';

/** Port of views/products/checkout.blade.php */
export default async function Checkout({ data }: { data: LoadedCheckout }) {
    const { product, plans, plan, optionState, checkoutConfig, fields, cartProductKey, category } = data;
    const tr = makeTranslator(await getLocale());
    const available = await product.availablePlans();

    const serializedPlans = await Promise.all(
        available.map(async (p) => {
            const price = await p.price();
            return { id: p.id as number, name: p.name as string, priceLabel: price.formatted.price, hasSetupFee: price.has_setup_fee, setupFeeLabel: price.formatted.setup_fee };
        }),
    );
    const total = await computePricing(product, plan, optionState);
    const price = await product.price();
    const buyable = (((product.stock as number | null) ?? 1) > 0 || !product.stock) && price.available;

    return (
        <CheckoutForm
            category={category.slug as string}
            productSlug={product.slug as string}
            productName={product.name as string}
            productImage={product.image ? storageUrl(product.image) : null}
            productDescription={(product.description as string) ?? ''}
            plans={serializedPlans}
            optionFields={await serializeConfigOptions(product, plans)}
            configFields={fields}
            initial={{ planId: plan.id as number, configOptions: optionState, checkoutConfig }}
            cartProductKey={cartProductKey}
            initialPricing={await pricingView(total, plan, tr)}
            buyable={buyable}
        />
    );
}
