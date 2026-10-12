import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { setting } from '@/server/config';
import { Service } from '@/server/models/Service';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Services');

/** Port of Livewire\Services\Index */
export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const user = await requireUser({ verified: true });
    const page = Math.max(1, Number((await searchParams).page) || 1);
    const services = await Service.query().where('user_id', user.id).orderBy('created_at', 'desc').paginate(Number(setting('pagination', 10)), page);
    return <ThemedPage view="services.index" sidebar title="Services" props={{ services }} />;
}
