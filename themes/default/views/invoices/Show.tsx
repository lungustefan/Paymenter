import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { brandIconName } from '@/components/icons/PaymentIcon';
import { setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { getCurrentUser } from '@/server/auth/session';
import { Carbon } from '@/server/lib/carbon';
import { InvoiceTransactionStatus } from '@/server/enums';
import { ExtensionHelper } from '@/server/extensions/helper';
import { checkoutGateways, billingGateways, recurringServiceItems } from '@/server/services/invoice/InvoicePayment';
import type { Invoice } from '@/server/models/Invoice';
import { nl2br, e, decimalString } from '@/server/lib/php';
import { InvoicePayment, PaymentPoller, type PaymentOptionsData } from './InvoiceShowClient';

const th = 'p-4 text-xs font-semibold tracking-wider text-left uppercase';

/** Port of views/invoices/show.blade.php */
export default async function Show({ invoice, showPayModal, checkPaymentParam }: { invoice: Invoice; showPayModal: boolean; checkPaymentParam: boolean }) {
    const tr = makeTranslator(await getLocale());
    const t = tr.t;
    const user = (await getCurrentUser())!;
    const items = await invoice.rel('items');
    const transactions = (await invoice.rel('transactions')).slice().sort((a, b) => (b.created_at?.valueOf() ?? 0) - (a.created_at?.valueOf() ?? 0));
    const formattedTotal = await invoice.formattedTotal();
    const tax = await invoice.tax();
    const proforma = !invoice.number && setting('invoice_proforma', false);

    const processing = transactions.filter((tx) => tx.status === InvoiceTransactionStatus.Processing);
    const checkPayment = (checkPaymentParam && invoice.status === 'pending') || processing.length > 0;
    const dayAgo = Carbon.now().subDays(1);
    const recentProcessing = processing.filter((tx) => tx.created_at && tx.created_at.valueOf() >= dayAgo.valueOf());

    // payment options (only needed while the invoice can be paid)
    let options: PaymentOptionsData | null = null;
    if (invoice.status === 'pending') {
        const credit = await user.relation('credits').where('currency_code', invoice.currency_code).where('amount', '>', 0).first();
        const itemHasCredit = items.some((i) => i.reference_type === 'App\\Models\\Credit');
        const saved = await user.relation('billingAgreements').with('gateway').get();
        const gateways = await checkoutGateways(invoice);
        const available = await ExtensionHelper.getAvailableExtensions();
        const remaining = await invoice.formattedRemaining();
        options = {
            credit: credit && !itemHasCredit ? { amount: String(await credit.formattedAmount()), covers: Number(credit.amount) >= Number(remaining.total) } : null,
            savedMethods: saved.map((m) => ({
                ulid: m.ulid as string,
                name: m.name as string,
                icon: brandIconName(m.type as string | null),
                expires: m.expiry ? Carbon.parse(m.expiry as any).format('m/Y') : null,
            })),
            gateways: gateways.map((g) => ({ id: g.id as number, name: g.name as string, icon: available.find((a) => a.type === 'gateway' && a.name === g.extension)?.meta?.icon ?? null })),
            hasRecurringServices: (await recurringServiceItems(invoice)).length > 0,
            remaining: String(remaining),
            paymentMethodsUrl: relativeUrl(route('account.payment-methods')),
        };
        void billingGateways;
    }

    const userProps = await invoice.userProperties();
    const referenceLinks = new Map<number, string>();
    for (const item of items) {
        if (item.reference_type === 'App\\Models\\Service') referenceLinks.set(item.id as number, relativeUrl(route('services.show', item.reference_id)));
        else if (item.reference_type === 'App\\Models\\ServiceUpgrade') {
            const ref = (await item.rel('reference')) as any;
            if (ref) referenceLinks.set(item.id as number, relativeUrl(route('services.show', ref.service_id)));
        }
    }
    const rows = await Promise.all(items.map(async (item) => ({ item, price: String(await item.formattedPrice()), total: String(await item.formattedTotal()) })));
    const txRows = await Promise.all(transactions.map(async (tx) => ({ tx, gateway: await tx.rel('gateway'), amount: String(await tx.formattedAmount()) })));
    const title = proforma ? t('invoices.proforma_invoice', { id: invoice.id }) : t('invoices.invoice', { id: invoice.number });

    return (
        <div className="container mt-14">
            <div>
                <div className="flex justify-end">
                    <div className="max-w-[200px] w-full text-right">
                        <a href={`${relativeUrl(route('invoices.show', invoice))}/pdf`} className="cursor-pointer text-base underline">
                            <span>{t('invoices.download_pdf')}</span>
                        </a>
                    </div>
                </div>

                <div className="bg-background-secondary border border-neutral p-12 rounded-lg mt-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
                    <div className="sm:flex justify-between pr-4 pt-4">
                        <div className="mt-4 sm:mt-0">
                            <p className="uppercase font-bold">{t('invoices.issued_to')}</p>
                            <p>{await invoice.userName()}</p>
                            {Object.entries(userProps).map(([key, property]) => (
                                <p key={key}>{property}</p>
                            ))}
                        </div>
                        <div className="mt-4 sm:mt-0 text-right">
                            <p className="uppercase font-bold">{t('invoices.bill_to')}</p>
                            <p dangerouslySetInnerHTML={{ __html: nl2br(e(await invoice.billTo())) }} />
                        </div>
                    </div>
                    <div className="sm:flex justify-between pr-4 pt-4 mt-6">
                        <div className="">
                            <p className="text-base">
                                {proforma ? t('invoices.proforma_invoice_date') : t('invoices.invoice_date')}: {invoice.created_at?.format('d M Y')}
                            </p>
                            {invoice.due_at && (
                                <p className="text-base">
                                    {t('invoices.due_date')}: {invoice.due_at.format('d M Y')}
                                </p>
                            )}
                            {invoice.number && (
                                <p className="text-base">
                                    {t('invoices.invoice_no')}: {invoice.number}
                                </p>
                            )}
                        </div>
                        <div className="max-w-[300px] w-full">
                            {invoice.status === 'paid' && <div className="text-green-500 mt-6 text-lg text-center font-semibold">{t('invoices.paid')}</div>}
                            {invoice.status === 'pending' &&
                                (checkPayment || recentProcessing.length > 0 ? (
                                    <>
                                        <div className="text-yellow-500 mb-6 text-lg text-center flex items-center justify-center">
                                            {t('invoices.payment_processing')}
                                            <Ri name="loader-5-fill" aria-hidden="true" className="size-6 ms-2 fill-yellow-600 animate-spin" />
                                        </div>
                                        {checkPayment && <PaymentPoller invoiceId={invoice.id as number} />}
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-6 text-lg text-center">
                                            {processing.length > 0 ? (
                                                <>
                                                    <span className="text-yellow-500">{t('invoices.payment_processing')}</span>
                                                    <p className="text-sm">{t('invoices.duplicate_payment')}</p>
                                                </>
                                            ) : (
                                                <span className="text-yellow-500">{t('invoices.payment_pending')}</span>
                                            )}
                                        </div>
                                        {options && (
                                            <InvoicePayment
                                                invoiceId={invoice.id as number}
                                                pending
                                                initiallyOpen={showPayModal}
                                                modalTitle={
                                                    proforma ? t('invoices.payment_for_proforma_invoice', { id: invoice.id }) : t('invoices.payment_for_invoice', { number: invoice.number })
                                                }
                                                amountDue={String(await invoice.formattedRemaining())}
                                                options={options}
                                                label="Pay"
                                            />
                                        )}
                                    </>
                                ))}
                        </div>
                    </div>

                    <div className="mt-12 border-b border-neutral overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-background border border-neutral rounded-lg">
                                <tr>
                                    <th scope="col" className={`${th} rounded-l-lg`}>
                                        {t('invoices.item')}
                                    </th>
                                    <th scope="col" className={th}>
                                        {t('invoices.price')}
                                    </th>
                                    <th scope="col" className={th}>
                                        {t('invoices.quantity')}
                                    </th>
                                    <th scope="col" className={`${th} rounded-r-lg`}>
                                        {t('invoices.total')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(({ item, price, total }) => (
                                    <tr key={item.id}>
                                        <td className="p-4 font-normal whitespace-nowrap">
                                            {referenceLinks.has(item.id as number) ? (
                                                <Link href={referenceLinks.get(item.id as number)!} className="hover:underline underline-offset-2">
                                                    {item.description}
                                                </Link>
                                            ) : (
                                                item.description
                                            )}
                                        </td>
                                        <td className="p-4 font-normal whitespace-nowrap text-base">{price}</td>
                                        <td className="p-4 font-normal whitespace-nowrap">{item.quantity}</td>
                                        <td className="p-4 whitespace-nowrap font-semibold">{total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="space-y-3 sm:text-right sm:ml-auto sm:w-72 mt-10">
                        {formattedTotal.tax > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <div className="text-sm font-medium text-gray-500 uppercase dark:text-base">{t('invoices.subtotal')}</div>
                                    <div className="text-base font-medium text-gray-900 dark:text-white">{formattedTotal.format(formattedTotal.subtotal)}</div>
                                </div>
                                <div className="flex justify-between">
                                    <div className="text-sm font-medium text-gray-500 uppercase dark:text-base">
                                        {tax?.name} ({decimalString(tax?.rate)}%)
                                    </div>
                                    <div className="text-base font-medium text-gray-900 dark:text-white">{formattedTotal.formatted.tax}</div>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between">
                            <div className="text-base font-semibold text-gray-900 uppercase dark:text-white">Total</div>
                            <div className="text-base font-bold text-gray-900 dark:text-white">{String(formattedTotal)}</div>
                        </div>
                    </div>

                    {transactions.length > 0 && (
                        <div className="mt-12">
                            <h2 className="text-2xl font-bold">{t('invoices.transactions')}</h2>
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-background border border-neutral rounded-lg">
                                        <tr>
                                            <th scope="col" className={`${th} rounded-l-lg`}>
                                                {t('invoices.date')}
                                            </th>
                                            <th scope="col" className={th}>
                                                {t('invoices.transaction_id')}
                                            </th>
                                            <th scope="col" className={th}>
                                                {t('invoices.gateway')}
                                            </th>
                                            <th scope="col" className={th}>
                                                {t('invoices.amount')}
                                            </th>
                                            <th scope="col" className={`${th} rounded-r-lg`}>
                                                {t('invoices.status')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {txRows.map(({ tx, gateway, amount }) => (
                                            <tr key={tx.id}>
                                                <td className="p-4 font-normal whitespace-nowrap">{tx.created_at?.format('d M Y H:i')}</td>
                                                <td className="p-4 font-normal whitespace-nowrap">{tx.transaction_id}</td>
                                                <td className="p-4 font-normal whitespace-nowrap">{tx.is_credit_transaction ? t('invoices.paid_with_credits') : (gateway?.name as string | undefined)}</td>
                                                <td className="p-4 font-normal whitespace-nowrap">{amount}</td>
                                                <td className="p-4 font-normal whitespace-nowrap">
                                                    {tx.status === InvoiceTransactionStatus.Succeeded && <span className="text-green-600 font-semibold">{t('invoices.transaction_statuses.succeeded')}</span>}
                                                    {tx.status === InvoiceTransactionStatus.Processing && (
                                                        <span className="text-yellow-600 font-semibold flex items-center">
                                                            {t('invoices.transaction_statuses.processing')}
                                                            <Ri name="loader-5-fill" aria-hidden="true" className="size-6 me-2 fill-yellow-600 animate-spin" />
                                                        </span>
                                                    )}
                                                    {tx.status === InvoiceTransactionStatus.Failed && <span className="text-red-600 font-semibold">{t('invoices.transaction_statuses.failed')}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
