import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { setting } from '@/server/config';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta('Payment Methods');

/** Port of Livewire\Client\PaymentMethods */
export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ page?: string; setup?: string }> }) {
    const user = await requireUser();
    const query = await searchParams;
    const page = Math.max(1, Number(query.page) || 1);
    // `$user->transactions()` goes through the user's invoices
    const transactions = await user
        .relation<InvoiceTransaction>('transactions')
        .with('invoice', 'gateway')
        .latest()
        .paginate(Number(setting('pagination', 10)), page);
    return <ThemedPage view="account.payment-methods" sidebar title="Payment Methods" props={{ transactions, setupModalVisible: query.setup !== undefined && !['0', 'false'].includes(query.setup) }} />;
}
