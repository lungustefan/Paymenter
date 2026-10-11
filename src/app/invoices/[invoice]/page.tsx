import { notFound } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { initRequest, requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { Invoice } from '@/server/models/Invoice';
import { once } from '@/server/request-store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ invoice: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Route model binding + `can:view,invoice` */
function loadInvoice(key: string) {
    return once(`pages:invoice:${key}`, async () => {
        const user = await requireUser({ verified: true });
        const invoice = await Invoice.resolveRouteBinding(decodeURIComponent(key));
        if (!invoice || invoice.user_id !== user.id) notFound();
        await invoice.load('transactions', 'transactions.gateway', 'transactions.invoice');
        return invoice;
    });
}

export async function generateMetadata({ params }: Props) {
    const { tr } = await initRequest();
    const invoice = await loadInvoice((await params).invoice);
    return pageMeta(tr.t('invoices.invoice', { id: invoice.number }));
}

/** Port of Livewire\Invoices\Show */
export default async function InvoicePage({ params, searchParams }: Props) {
    await initRequest();
    const invoice = await loadInvoice((await params).invoice);
    const query = await searchParams;
    const pay = query.pay !== undefined && !['0', 'false', ''].includes(String(query.pay));
    return (
        <ThemedPage
            view="invoices.show"
            sidebar
            props={{ invoice, showPayModal: pay && invoice.status === 'pending', checkPaymentParam: query.checkPayment !== undefined }}
        />
    );
}
