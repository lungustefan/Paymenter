import { ThemedPage } from '@/components/ThemedPage';
import { initRequest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { Category } from '@/server/models/Category';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Home');

/** Port of Livewire\Home */
export default async function HomePage() {
    await initRequest();
    const categories = await Category.query()
        .whereNull('parent_id')
        .where((q) => {
            q.whereHas('children').orWhereHas('products', (pq) => {
                pq.where('hidden', false);
            });
        })
        .with('products.plans.prices')
        .orderBy('sort')
        .get();

    return <ThemedPage view="home" props={{ categories }} title="Home" />;
}
