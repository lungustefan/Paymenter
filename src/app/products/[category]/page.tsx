import { ThemedPage } from '@/components/ThemedPage';
import { handleCheckoutParameters, initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { storageUrl } from '@/server/routes';
import { loadCategoryPage } from '@/server/pages/products';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
    await initRequest();
    const { category } = await loadCategoryPage((await params).category);
    return pageMeta(category.name as string, null, category.image ? storageUrl(category.image) : null);
}

/** Port of Livewire\Products\Index */
export default async function CategoryPage({ params, searchParams }: Props) {
    await initRequest();
    await handleCheckoutParameters(await searchParams);
    const data = await loadCategoryPage((await params).category);
    return <ThemedPage view="products.index" props={data} title={data.category.name as string} />;
}
