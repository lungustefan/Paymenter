import { ThemedPage } from '@/components/ThemedPage';
import { handleCheckoutParameters, initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { storageUrl } from '@/server/routes';
import { loadProductPage } from '@/server/pages/products';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string; product: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
    await initRequest();
    const p = await params;
    const { product } = await loadProductPage(p.category, p.product);
    return pageMeta(product.name as string, null, product.image ? storageUrl(product.image) : null);
}

/** Port of Livewire\Products\Show */
export default async function ProductPage({ params, searchParams }: Props) {
    await initRequest();
    await handleCheckoutParameters(await searchParams);
    const p = await params;
    const data = await loadProductPage(p.category, p.product);
    return <ThemedPage view="products.show" props={data} title={data.product.name as string} />;
}
