import Link from 'next/link';
import type { ReactNode } from 'react';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { currentPath } from '@/server/request';
import { getCurrentUser } from '@/server/auth/session';
import { Carbon } from '@/server/lib/carbon';
import { Invoice } from '@/server/models/Invoice';
import { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import type { Service } from '@/server/models/Service';
import { brandIconName } from '@/components/icons/PaymentIcon';
import { PrimaryButton } from '../../components/Button';
import { cn } from '../../components/cn';
import { AgreementView, BillingAgreementEditor, LabelEditor, ServiceActions, type ServiceButton } from './ServiceShowClient';

/** Renders what a server extension's `getView()` returned. */
function renderExtensionView(view: unknown): ReactNode {
    if (view === null || view === undefined) return null;
    if (typeof view === 'string') return <div className="contents" dangerouslySetInnerHTML={{ __html: view }} />;
    if (typeof view === 'object' && view !== null && 'html' in view) return <div className="contents" dangerouslySetInnerHTML={{ __html: String((view as any).html) }} />;
    return view as ReactNode;
}

/** Port of views/services/show.blade.php */
export default async function Show({
    service,
    buttons,
    views,
    fields,
    currentView,
    extensionView,
    showCancel,
    editLabel,
}: {
    service: Service;
    buttons: any[];
    views: any[];
    fields: any[];
    currentView: string | null;
    extensionView: unknown;
    showCancel: boolean;
    editLabel: boolean;
}) {
    const tr = makeTranslator(await getLocale());
    const t = tr.t;
    const user = (await getCurrentUser())!;
    const plan = (await service.rel('plan'))!;
    const product = (await service.rel('product'))!;
    const cancellation = await service.rel('cancellation');
    const invoice = await service.relation<Invoice>('invoices').where('status', 'pending').first();
    const upgradable = await service.upgradable();
    const cancellable = await service.cancellable();
    const pendingUpgrade = await service.relation<ServiceUpgrade>('upgrade').where('status', 'pending').exists();
    const agreement = await service.rel('billingAgreement');
    const userAgreements = await user.rel('billingAgreements');
    const path = await currentPath();
    const price = await service.formattedPrice();
    const label = await service.displayLabel();
    const baseLabel = await service.baseLabel();

    const agreementViews: AgreementView[] = userAgreements.map((a) => ({
        ulid: a.ulid as string,
        name: a.name as string,
        type: a.type as string | null,
        icon: brandIconName(a.type as string | null),
        expiry: a.expiry ? Carbon.parse(a.expiry as any).format('m/Y') : null,
    }));

    const statusClass = service.status === 'active' ? 'text-green-500' : service.status === 'cancelled' ? 'text-red-500' : 'text-orange-500';

    return (
        <div className="container mt-14">
            {invoice && (
                <div className="w-full mb-4">
                    <div className="bg-yellow-600/20 border-l-4 border-yellow-500 text-yellow-300 p-4 rounded-lg">
                        <p className="font-medium">
                            ⚠️ {t('services.outstanding_invoice')}{' '}
                            <Link href={relativeUrl(route('invoices.show', invoice))} className="underline hover:text-yellow-100 underline-offset-2">
                                {t('services.view_and_pay')}
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            )}
            <div className="bg-background-secondary border border-neutral p-6 rounded-lg mt-2">
                <div className="flex flex-col md:flex-row justify-between">
                    <h1 className="text-2xl font-semibold">{t('services.services')}</h1>
                </div>
                <div className="grid md:grid-cols-2 gap-4 my-4">
                    <div>
                        <h4 className="text-lg font-semibold">{t('services.product_details')}:</h4>
                        <div className="mt-2">
                            <LabelEditor serviceId={service.id as number} label={label} baseLabel={baseLabel} initiallyOpen={editLabel} />
                            <div className="flex items-center text-base">
                                <span className="mr-2">{t('services.price')}:</span>
                                <span className="text-base/50">{String(price)}</span>
                            </div>
                            {plan.type === 'recurring' && (
                                <>
                                    <div className="flex items-center text-base">
                                        <span className="mr-2">{t('services.billing_cycle')}:</span>
                                        <span className="text-base/50">
                                            {t('services.every_period', {
                                                period: (plan.billing_period as number) > 1 ? plan.billing_period : '',
                                                unit: tr.tChoice(t(`services.billing_cycles.${plan.billing_unit}`), plan.billing_period as number),
                                            })}
                                        </span>
                                    </div>
                                    {service.expires_at && (
                                        <div className="flex items-center text-base">
                                            <span className="mr-2">{t('services.renews_on')}:</span>
                                            <span className="text-base/50">{service.expires_at.format('M d, Y')}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="flex items-center text-base">
                                <span className="mr-2">{t('services.status')}:</span>
                                {cancellation && service.status === 'active' ? (
                                    <span className="font-semibold text-orange-500">{t('services.statuses.cancellation_pending')}</span>
                                ) : (
                                    <span className={cn('font-semibold', statusClass)}>{t(`services.statuses.${service.status}`)}</span>
                                )}
                            </div>
                            {plan.type === 'recurring' && service.status === 'active' && userAgreements.length > 0 && (
                                <BillingAgreementEditor serviceId={service.id as number} current={agreement ? { ulid: agreement.ulid as string, name: agreement.name as string } : null} agreements={agreementViews} />
                            )}
                            <br />
                            {fields.map((field, i) => (
                                <div className="flex items-center text-base" key={i}>
                                    <span className="mr-2">{field.label}:</span>
                                    <span className="text-base/50">{field.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {(cancellable || upgradable || buttons.length > 0) && (
                        <div>
                            <h4 className="text-lg font-semibold">{t('services.actions')}:</h4>
                            <ServiceActions
                                serviceId={service.id as number}
                                upgradeUrl={upgradable ? relativeUrl(route('services.upgrade', service.id)) : null}
                                upgradePending={pendingUpgrade}
                                cancellable={cancellable}
                                cancelTitle={t('services.cancellation', { service: product.name })}
                                initiallyCancelling={showCancel}
                                buttons={buttons as ServiceButton[]}
                            />
                        </div>
                    )}
                </div>
            </div>

            {views.length > 0 && (
                <div className="bg-primary-800 rounded-lg mt-2">
                    {views.length > 1 && (
                        <div className="flex w-fit mb-2 flex-row flex-wrap">
                            {views.map((view) => (
                                <Link
                                    key={view.name}
                                    href={`${path}?tab=${encodeURIComponent(view.name)}`}
                                    replace
                                    scroll={false}
                                    className={cn('px-4 py-2 -mb-px focus:outline-none', view.name === currentView ? 'border-b-2 border-gray-400 font-semibold' : 'text-base border-b border-gray-500 ')}
                                >
                                    {view.label}
                                </Link>
                            ))}
                        </div>
                    )}
                    <div>{renderExtensionView(extensionView)}</div>
                </div>
            )}
        </div>
    );
}
void PrimaryButton;
