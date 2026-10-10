import { ThemedPage } from '@/components/ThemedPage';
import { handleCheckoutParameters, initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

/** Port of Livewire\Cart */
export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    await initRequest();
    await handleCheckoutParameters(await searchParams);
    return <ThemedPage view="cart" />;
}
