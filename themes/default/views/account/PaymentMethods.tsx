import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { PaymentIcon, brandIconName } from '@/components/icons/PaymentIcon';
import { setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { getCurrentUser } from '@/server/auth/session';
import { Carbon } from '@/server/lib/carbon';
import { InvoiceTransactionStatus } from '@/server/enums';
import { ExtensionHelper } from '@/server/extensions/helper';
import type { BillingAgreement } from '@/server/models/BillingAgreement';
import type { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { Breadcrumb } from '../../components/Breadcrumb';
import { Pagination } from '../../components/Pagination';
import { AddPaymentMethod, RemovePaymentMethod } from './PaymentMethodsClient';

/** Port of views/client/account/payment-methods.blade.php */
export default async function PaymentMethods({ transactions, setupModalVisible }: { transactions: { data: InvoiceTransaction[]; current_page: number; last_page: number }; setupModalVisible: boolean }) {
    const t = makeTranslator(await getLocale()).t;
    const user = (await getCurrentUser())!;
    const gateways = (await ExtensionHelper.getBillingAgreementGateways()).map((g) => ({ id: g.id as number, name: g.name as string }));
    const agreements = await user.relation<BillingAgreement>('billingAgreements').with('gateway').latest().get();
    const available = await ExtensionHelper.getAvailableExtensions();

    // groupBy('gateway.name')
    const groups = new Map<string, { icon: string | null; agreements: BillingAgreement[] }>();
    for (const agreement of agreements) {
        const gateway = await agreement.rel('gateway');
        const name = (gateway?.name as string) ?? '';
        if (!groups.has(name)) groups.set(name, { icon: available.find((a) => a.type === 'gateway' && a.name === gateway?.extension)?.meta?.icon ?? null, agreements: [] });
        groups.get(name)!.agreements.push(agreement);
    }
    const linked = new Map<number, number>();
    for (const a of agreements) linked.set(a.id as number, await a.relation('services').count());

    const txRows = await Promise.all(
        transactions.data.map(async (tx) => ({ tx, invoice: await tx.rel('invoice'), gateway: await tx.rel('gateway'), amount: String(await tx.formattedAmount()) })),
    );
    void setting;

    /* eslint-disable @next/next/no-img-element */
    return (
        <div className="container mt-14">
            <Breadcrumb />
            <div className="px-2">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-2xl font-bold">{t('account.saved_payment_methods')}</h3>
                        <p className="text-sm text-base/70">{t('account.saved_payment_methods_description')}</p>
                    </div>
                    {gateways.length > 0 && <AddPaymentMethod gateways={gateways} initiallyOpen={setupModalVisible} />}
                </div>

                {groups.size > 0 ? (
                    [...groups.entries()].map(([gatewayName, group]) => (
                        <div key={gatewayName}>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3 mt-8">
                                    <div className="bg-background-secondary border border-neutral rounded-lg overflow-hidden size-9 flex items-center justify-center">
                                        {group.icon ? <img src={group.icon} alt={gatewayName} className="size-9" /> : <Ri name="secure-payment-line" className="size-5 text-primary" />}
                                    </div>
                                    <h2 className="text-xl font-semibold">{gatewayName}</h2>
                                </div>
                                <span className="bg-primary flex items-center justify-center font-semibold rounded-md size-5 text-sm text-white">{group.agreements.length}</span>
                            </div>

                            {group.agreements.map((agreement) => {
                                const icon = brandIconName(agreement.type as string | null);
                                const count = linked.get(agreement.id as number) ?? 0;
                                return (
                                    <div key={agreement.id} className="bg-background-secondary border border-neutral p-4 rounded-lg mb-4 hover:bg-background-secondary/80 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="rounded-lg overflow-hidden flex items-center justify-center">
                                                    {icon ? <PaymentIcon name={icon} className="size-9" /> : <Ri name="bank-card-line" className="size-6 text-primary" />}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-base">{agreement.name}</div>
                                                    {agreement.expiry && <div className="text-sm text-neutral-500">{t('account.expires', { date: Carbon.parse(agreement.expiry as any).format('m/Y') })}</div>}
                                                    {count > 0 && <div className="text-xs text-base/50 mt-1">{t('account.services_linked', { count })}</div>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <RemovePaymentMethod ulid={agreement.ulid as string} name={agreement.name as string} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))
                ) : (
                    <div className="bg-background-secondary border border-neutral p-6 rounded-lg text-center">
                        <Ri name="bank-card-line" className="size-12 text-base/30 mx-auto mb-3" />
                        <p className="text-base/70 mb-4">{t('account.no_saved_payment_methods')}</p>
                    </div>
                )}

                <h3 className="text-lg font-bold pb-3 mt-8">{t('account.recent_transactions')}</h3>
                {txRows.map(({ tx, invoice, gateway, amount }) => (
                    <Link key={tx.id} href={relativeUrl(route('invoices.show', invoice))}>
                        <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-1 rounded-lg mb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-secondary/10 p-2 rounded-lg">
                                        <Ri name="bill-line" className="size-5 text-secondary" />
                                    </div>
                                    <span className="font-medium">{tx.transaction_id ? `Transaction: ${tx.transaction_id}` : 'Transaction ID N/A'}</span>
                                    <span className="text-base/50 font-semibold">
                                        <Ri name="circle-fill" className="size-1 text-base/20" />
                                    </span>
                                    <span className="text-base text-sm">
                                        {amount} using {gateway ? (gateway.name as string) : 'N/A'}
                                    </span>
                                </div>
                                <div className="pr-2">
                                    <span className="text-sm text-base/70 mr-1">
                                        {tx.status === InvoiceTransactionStatus.Succeeded && (
                                            <span className="inline-flex items-center px-1 py-0.5 pr-1.5 rounded-full text-xs bg-green-100 text-green-800">
                                                <Ri name="check-line" className="size-3 mr-1" />
                                                {t('invoices.transaction_statuses.succeeded')}
                                            </span>
                                        )}
                                        {tx.status === InvoiceTransactionStatus.Processing && (
                                            <span className="inline-flex items-center px-1 py-0.5 pr-1.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                                <Ri name="loader-5-fill" className="size-3 mr-1 fill-yellow-600 animate-spin" />
                                                {t('invoices.transaction_statuses.processing')}
                                            </span>
                                        )}
                                        {tx.status === InvoiceTransactionStatus.Failed && (
                                            <span className="inline-flex items-center px-1 py-0.5 pr-1.5 rounded-full text-xs bg-red-100 text-red-800">
                                                <Ri name="close-line" className="size-3 mr-1" />
                                                {t('invoices.transaction_statuses.failed')}
                                            </span>
                                        )}
                                    </span>{' '}
                                    {tx.created_at?.format('d M Y H:i')}
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
                <Pagination paginator={transactions} />
            </div>
        </div>
    );
}
