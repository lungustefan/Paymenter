import { ThemedPage } from '@/components/ThemedPage';
import { initRequest, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { setting } from '@/server/config';
import { Invoice } from '@/server/models/Invoice';
import { t } from '@/server/i18n';
import { getLocale } from '@/server/page';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
    await initRequest();
    return pageMeta(t('invoices.invoices', {}, await getLocale()));
}

/** Port of Livewire\Invoices\Index */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const user = await requireUser({ verified: true });
    const page = Math.max(1, Number((await searchParams).page) || 1);
    const invoices = await Invoice.query().where('user_id', user.id).with('user', 'snapshot', 'items').orderBy('id', 'desc').paginate(Number(setting('pagination', 10)), page);
    return <ThemedPage view="invoices.index" sidebar props={{ invoices }} />;
}
