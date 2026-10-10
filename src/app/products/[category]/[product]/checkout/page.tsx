import { redirect } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { handleCheckoutParameters, initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { storageUrl } from '@/server/routes';
import { loadCheckout, parseCheckoutQuery } from '@/server/pages/checkout';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string; product: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props) {
    await initRequest();
    const p = await params;
    const { product } = await loadCheckout(p.category, p.product, parseCheckoutQuery(await searchParams));
    return pageMeta(product.name as string, null, product.image ? storageUrl(product.image) : null);
}

/** Port of Livewire\Products\Checkout */
export default async function CheckoutPage({ params, searchParams }: Props) {
    await initRequest();
    const search = await searchParams;
    await handleCheckoutParameters(search);
    const p = await params;
    const data = await loadCheckout(p.category, p.product, parseCheckoutQuery(search));

    // As there is only one plan, config options and checkout config, the item goes straight to the cart
    // (not when editing an item that is already in the cart)
    if (data.plans.length === 1 && data.configOptions.length === 0 && data.fields.length === 0 && !data.cartProductKey) {
        redirect(`/cart/add?product=${data.product.id}`);
    }
    return <ThemedPage view="products.checkout" props={{ data }} title={data.product.name as string} />;
}
