'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Ri } from '@/components/icons/Ri';
import { PaymentIcon } from '@/components/icons/PaymentIcon';
import { checkPaymentStatusAction, exitPayAction, processPaymentAction } from '@/actions/invoices';
import { PrimaryButton, SecondaryButton } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Toggle } from '../../components/Form';
import { Loading } from '../../components/Loading';
import { useForm } from '../../components/useForm';
import { useNotify, useT } from '../../components/Providers';
import { cn } from '../../components/cn';

export interface SavedMethodView {
    ulid: string;
    name: string;
    icon: string | null;
    expires: string | null;
}
export interface GatewayView {
    id: number;
    name: string;
    icon: string | null;
}
export interface PaymentOptionsData {
    credit: { amount: string; covers: boolean } | null;
    savedMethods: SavedMethodView[];
    gateways: GatewayView[];
    hasRecurringServices: boolean;
    remaining: string;
    paymentMethodsUrl: string;
}

/** The radio-card used by every payment option */
function OptionCard({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'flex items-center justify-between p-4 bg-background-secondary border rounded-lg cursor-pointer transition-all',
                selected ? 'border-primary ring-2 ring-primary' : 'border-neutral hover:border-neutral-focus',
                className,
            )}
        >
            {children}
        </div>
    );
}

function Radio({ selected }: { selected: boolean }) {
    return (
        <div className={cn('size-5 rounded-full bg-background-secondary border border-neutral flex items-center justify-center', selected ? 'border-primary bg-primary' : 'border-neutral-focus')}>
            {selected && <Ri name="check-line" className="size-4 text-white" />}
        </div>
    );
}

/** Port of views/invoices/partials/payment-options.blade.php */
function PaymentOptions({ invoiceId, options, onView }: { invoiceId: number; options: PaymentOptionsData; onView: (view: ReactNode) => void }) {
    const { t } = useT();
    const form = useForm({ selectedMethod: null as string | null, setAsDefault: false });
    const [showOneTime, setShowOneTime] = useState(options.savedMethods.length === 0);
    const selected = form.data.selectedMethod;
    const select = (m: string) => form.set('selectedMethod', m);

    return (
        <div>
            {options.credit && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">{t('invoices.pay_with_credits')}</h3>
                    <OptionCard selected={selected === 'credit'} onClick={() => select('credit')}>
                        <div className="flex items-center space-x-4">
                            <div className="text-xl">
                                <Ri name="copper-coin-line" className="size-6 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium">{t('invoices.account_credits')}</p>
                                <p className="text-sm text-base/50">{t('invoices.available_credits', { amount: options.credit.amount })}</p>
                            </div>
                        </div>
                        <Radio selected={selected === 'credit'} />
                    </OptionCard>
                </div>
            )}

            {options.savedMethods.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">{t('account.saved_payment_methods')}</h3>
                    <div className="space-y-3">
                        {options.savedMethods.map((method) => (
                            <OptionCard key={method.ulid} selected={selected === method.ulid} onClick={() => select(method.ulid)}>
                                <div className="flex items-center gap-4">
                                    <div>{method.icon ? <PaymentIcon name={method.icon} className="size-9" /> : <Ri name="bank-card-line" className="size-6 text-primary" />}</div>
                                    <div>
                                        <div className="font-semibold text-base"> {method.name} </div>
                                        {method.expires && <div className="text-sm text-neutral-500">{t('account.expires', { date: method.expires })}</div>}
                                    </div>
                                </div>
                                <Radio selected={selected === method.ulid} />
                            </OptionCard>
                        ))}
                        <Link href={options.paymentMethodsUrl}>
                            <SecondaryButton>
                                <Ri name="add-line" className="size-4" />
                                {t('account.add_payment_method')}
                            </SecondaryButton>
                        </Link>
                    </div>
                </div>
            )}

            {options.gateways.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={() => setShowOneTime((s) => !s)}
                        className={cn('flex items-center justify-between w-full p-3 text-left rounded-lg border border-neutral transition-colors', options.savedMethods.length === 0 && 'hidden')}
                    >
                        <span className="text-sm font-medium">{t('invoices.pay_with_one_time_method')}</span>
                        <Ri name="arrow-down-s-line" className={cn('size-5 text-gray-500 transition-transform duration-200', showOneTime && 'rotate-180')} />
                    </button>
                    {showOneTime && (
                        <div className="space-y-3 mt-3">
                            {options.gateways.map((method) => (
                                <OptionCard key={method.id} selected={selected === `gateway-${method.id}`} onClick={() => select(`gateway-${method.id}`)} className="">
                                    <div className="flex items-center space-x-4">
                                        <div className="bg-background-secondary border border-neutral rounded-lg overflow-hidden flex items-center justify-center h-9 w-9">
                                            {method.icon ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={method.icon} alt={`${method.name} Icon`} className="h-9 w-9 object-contain" /> : <Ri name="secure-payment-line" className="size-5 text-primary" />}
                                        </div>
                                        <div>
                                            <p className="font-medium">{method.name}</p>
                                            <p className="text-sm text-base/50">{t('invoices.one_time_payment')}</p>
                                        </div>
                                    </div>
                                    <Radio selected={selected === `gateway-${method.id}`} />
                                </OptionCard>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {selected && selected !== 'credit' && !selected.startsWith('gateway-') && options.hasRecurringServices && (
                <div className="mt-4 p-2">
                    <Toggle id="setAsDefault" label={t('invoices.use_for_recurring')} checked={form.data.setAsDefault} onChange={(e) => form.set('setAsDefault', e.target.checked)} />
                </div>
            )}

            <div className="mt-6">
                <PrimaryButton
                    className="w-full"
                    disabled={!selected || form.pending}
                    onClick={() =>
                        form.startTransition(async () => {
                            const result = form.apply(await processPaymentAction(invoiceId, selected, form.data.setAsDefault));
                            if (result.view) onView(result.view);
                        })
                    }
                >
                    <Loading show={form.pending} />
                    {!form.pending && (
                        <div>
                            {selected === 'credit' && options.credit?.covers
                                ? t('invoices.apply_credits_and_pay')
                                : selected === 'credit' && options.credit
                                  ? t('invoices.apply_credit_and_continue', { amount: options.credit.amount })
                                  : t('invoices.pay_now', { amount: options.remaining })}
                        </div>
                    )}
                </PrimaryButton>
            </div>
        </div>
    );
}

/** Pay button + payment modal (payment-modal.blade.php) and the five second poll while a payment is processing. */
export function InvoicePayment({
    invoiceId,
    pending,
    initiallyOpen,
    modalTitle,
    amountDue,
    options,
    label,
}: {
    invoiceId: number;
    pending: boolean;
    initiallyOpen: boolean;
    modalTitle: string;
    amountDue: string;
    options: PaymentOptionsData;
    label: ReactNode;
}) {
    const { t } = useT();
    const form = useForm({});
    const [open, setOpen] = useState(initiallyOpen && pending);
    const [view, setView] = useState<ReactNode>(null);

    // `#[Url('pay')]`
    const toggle = (next: boolean) => {
        setOpen(next);
        const url = new URL(window.location.href);
        if (next) url.searchParams.set('pay', 'true');
        else url.searchParams.delete('pay');
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <>
            <PrimaryButton className="mt-2" onClick={() => toggle(true)}>
                {label}
            </PrimaryButton>
            <Modal
                open={open || view !== null}
                title={modalTitle}
                onClose={() => undefined}
                closable
                closeTrigger={
                    <div className="flex gap-4">
                        {t('invoices.amount_due', { amount: amountDue })}
                        <button
                            onClick={() => {
                                if (!window.confirm('Are you sure?')) return;
                                setOpen(false);
                                setView(null);
                                form.run(() => exitPayAction(invoiceId));
                            }}
                            className="text-primary-100"
                        >
                            <Ri name="close-fill" className="size-6" />
                        </button>
                    </div>
                }
            >
                {view ? <div className="mt-8">{view}</div> : <PaymentOptions invoiceId={invoiceId} options={options} onView={setView} />}
            </Modal>
        </>
    );
}

/** `wire:poll.5s="checkPaymentStatus"` while a payment is being processed */
export function PaymentPoller({ invoiceId }: { invoiceId: number }) {
    const { t } = useT();
    const router = useRouter();
    const notify = useNotify();
    const lastChecked = useRef<string | null>(null);

    useEffect(() => {
        const timer = setInterval(async () => {
            const result = await checkPaymentStatusAction(invoiceId, lastChecked.current);
            lastChecked.current = result.checkedAt;
            if (result.failed) {
                notify(t('Payment failed. Please try again or use a different payment method.'), 'error');
                clearInterval(timer);
                router.refresh();
            } else if (result.paid) {
                notify(t('The invoice has been paid.'), 'success');
                clearInterval(timer);
                router.refresh();
            }
        }, 5000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceId]);

    return null;
}
