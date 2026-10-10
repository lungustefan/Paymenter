'use client';

import { useState } from 'react';
import { Ri } from '@/components/icons/Ri';
import { PaymentIcon } from '@/components/icons/PaymentIcon';
import { cancelServiceAction, clearBillingAgreementAction, gotoAction, updateBillingAgreementAction, updateLabelAction } from '@/actions/services';
import { PrimaryButton, DangerButton } from '../../components/Button';
import { Input, SelectField, Textarea } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { Tooltip } from '../../components/Tooltip';
import { Loading } from '../../components/Loading';
import { useForm } from '../../components/useForm';
import { useConfirm, useNotify, useT } from '../../components/Providers';
import { cn } from '../../components/cn';

/** Port of views/services/partials/label.blade.php */
export function LabelEditor({ serviceId, label, baseLabel, initiallyOpen }: { serviceId: number; label: string; baseLabel: string; initiallyOpen: boolean }) {
    const { t } = useT();
    const [open, setOpen] = useState(initiallyOpen);
    const form = useForm({ label });

    return (
        <>
            <div className="flex items-center text-base">
                <span className="mr-2">{t('services.name')}:</span>
                <span className="text-base/50 flex gap-1" id="help-btn">
                    {label !== baseLabel ? <Tooltip message={baseLabel}>{label}</Tooltip> : label}
                    <button onClick={() => setOpen(true)} className="cursor-pointer">
                        <span>
                            <Ri name="edit-line" className="inline size-4 text-base/50" />
                        </span>
                    </button>
                </span>
            </div>
            <Modal
                open={open}
                title={t('services.label_modal_title')}
                onClose={() => setOpen(false)}
                closeTrigger={
                    <div className="flex gap-4">
                        <button onClick={() => setOpen(false)} className="text-primary-100">
                            <Ri name="close-fill" className="size-6" />
                        </button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <Input label={t('services.label')} placeholder={t('services.label_placeholder')} {...form.bind('label')} />
                    </div>
                    <div className="flex justify-end">
                        <PrimaryButton onClick={() => form.run(() => updateLabelAction(serviceId, form.data.label), (r) => r.ok && setOpen(false))} disabled={form.pending}>
                            {t('services.update_label')}
                        </PrimaryButton>
                    </div>
                </div>
            </Modal>
        </>
    );
}

export interface AgreementView {
    ulid: string;
    name: string;
    type: string | null;
    icon: string | null;
    expiry: string | null;
}

/** Port of views/services/partials/billing-agreement.blade.php */
export function BillingAgreementEditor({
    serviceId,
    current,
    agreements,
}: {
    serviceId: number;
    current: { ulid: string; name: string } | null;
    agreements: AgreementView[];
}) {
    const { t } = useT();
    const confirm = useConfirm();
    const form = useForm({});
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(current?.ulid ?? null);

    return (
        <>
            <div className="flex items-center text-base">
                <span className="mr-2">{t('services.auto_pay')}:</span>
                <span className="text-base/50">
                    {current ? current.name : t('services.auto_pay_not_configured')}
                    <button
                        onClick={() => {
                            setSelected(current?.ulid ?? null);
                            setOpen(true);
                        }}
                        className="cursor-pointer"
                    >
                        <Ri name="edit-line" className="inline size-4 ml-1 text-base/50" />
                    </button>
                    {current && (
                        <button
                            onClick={() =>
                                confirm({
                                    title: t('services.remove_payment_method'),
                                    message: t('services.remove_payment_method_confirm', { name: current.name }),
                                    confirmText: t('common.confirm'),
                                    cancelText: t('common.cancel'),
                                    callback: async () => {
                                        form.apply(await clearBillingAgreementAction(serviceId));
                                    },
                                })
                            }
                            className="cursor-pointer"
                        >
                            <Ri name="close-line" className="inline size-4 ml-1 text-base/50" />
                        </button>
                    )}
                </span>
            </div>
            <Modal
                open={open}
                title={t('services.select_billing_agreement')}
                onClose={() => setOpen(false)}
                closeTrigger={
                    <div className="flex gap-4">
                        <button onClick={() => setOpen(false)} className="text-primary-100">
                            <Ri name="close-fill" className="size-6" />
                        </button>
                    </div>
                }
            >
                <div className="space-y-4">
                    {agreements.map((agreement) => (
                        <div
                            key={agreement.ulid}
                            onClick={() => setSelected(agreement.ulid)}
                            className={cn(
                                'flex items-center justify-between p-4 bg-background-secondary border rounded-lg cursor-pointer transition-all',
                                selected === agreement.ulid ? 'border-primary ring-2 ring-primary' : 'border-neutral hover:border-neutral-focus',
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div>{agreement.icon ? <PaymentIcon name={agreement.icon} className="size-9" /> : <Ri name="bank-card-line" className="size-6 text-primary" />}</div>
                                <div>
                                    <div className="font-semibold text-base"> {agreement.name} </div>
                                    {agreement.expiry && <div className="text-sm text-neutral-500">Expires: {agreement.expiry}</div>}
                                </div>
                            </div>
                            <div className={cn('size-5 rounded-full border border-neutral flex items-center justify-center', selected === agreement.ulid ? 'border-primary bg-primary' : 'border-neutral-focus')}>
                                {selected === agreement.ulid && <Ri name="check-line" className="size-4 text-white" />}
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-end">
                        <PrimaryButton
                            onClick={() => selected && form.run(() => updateBillingAgreementAction(serviceId, selected), (r) => r.ok && setOpen(false))}
                            disabled={form.pending}
                        >
                            {t('services.update_billing_agreement')}
                        </PrimaryButton>
                    </div>
                </div>
            </Modal>
        </>
    );
}

/** Port of views/services/cancel.blade.php + Livewire\Services\Cancel */
function CancelForm({ serviceId }: { serviceId: number }) {
    const { t } = useT();
    const form = useForm({ type: 'end_of_period', reason: '' });
    return (
        <div className="flex flex-col gap-4">
            {t('services.cancel_are_you_sure')}

            <SelectField label={t('services.cancel_type')} required {...form.bind('type')}>
                <option value="end_of_period">{t('services.cancel_end_of_period')}</option>
                <option value="immediate">{t('services.cancel_immediate')}</option>
            </SelectField>

            <Textarea label={t('services.cancel_reason')} maxLength={255} required {...form.bind('reason')} />

            {form.data.type === 'immediate' && <div className="bg-orange-700 text-white p-4 rounded">{t('services.cancel_immediate_warning')}</div>}

            <DangerButton
                onClick={() => {
                    if (window.confirm('Are you sure?')) form.run(() => cancelServiceAction(serviceId, { type: form.data.type, reason: form.data.reason }));
                }}
                disabled={form.pending}
            >
                {t('services.cancel')}
            </DangerButton>
        </div>
    );
}

export interface ServiceButton {
    label: string;
    function?: string;
    url?: string;
    target?: string;
}

/** Action buttons of views/services/show.blade.php (upgrade, cancel, extension buttons) */
export function ServiceActions({
    serviceId,
    upgradeUrl,
    upgradePending,
    cancellable,
    cancelTitle,
    initiallyCancelling,
    buttons,
}: {
    serviceId: number;
    upgradeUrl: string | null;
    upgradePending: boolean;
    cancellable: boolean;
    cancelTitle: string;
    initiallyCancelling: boolean;
    buttons: ServiceButton[];
}) {
    const { t } = useT();
    const notify = useNotify();
    const [showCancel, setShowCancel] = useState(initiallyCancelling && cancellable);
    const form = useForm({});
    const [busy, setBusy] = useState<string | null>(null);

    const toggleCancel = (open: boolean) => {
        setShowCancel(open);
        const url = new URL(window.location.href);
        if (open) url.searchParams.set('cancel', 'true');
        else url.searchParams.delete('cancel');
        window.history.replaceState(null, '', url.toString());
    };

    return (
        <>
            <div className="mt-2 flex flex-row gap-2 flex-wrap">
                {upgradeUrl && (
                    <a href={upgradeUrl}>
                        <PrimaryButton className="h-fit !w-fit">
                            <span>{t('services.upgrade')}</span>
                        </PrimaryButton>
                    </a>
                )}
                {upgradePending && (
                    <PrimaryButton className="h-fit !w-fit" onClick={() => notify(t('services.upgrade_pending'), 'error')}>
                        <span>{t('services.upgrade')}</span>
                    </PrimaryButton>
                )}
                {cancellable && (
                    <DangerButton className="h-fit !w-fit" onClick={() => toggleCancel(true)}>
                        <span>{t('services.cancel')}</span>
                    </DangerButton>
                )}
                <Modal
                    open={showCancel}
                    width="max-w-3xl"
                    title={cancelTitle}
                    onClose={() => toggleCancel(false)}
                    closeTrigger={
                        <div className="flex gap-4">
                            <button onClick={() => toggleCancel(false)} className="text-primary-100">
                                <Ri name="close-fill" className="size-6" />
                            </button>
                        </div>
                    }
                >
                    <CancelForm serviceId={serviceId} />
                </Modal>
            </div>
            <div className="mt-2 flex flex-row gap-2 flex-wrap">
                {buttons.map((button, i) =>
                    button.function ? (
                        <PrimaryButton
                            key={i}
                            className="h-fit !w-fit"
                            onClick={() => {
                                setBusy(button.function!);
                                form.run(() => gotoAction(serviceId, button.function!), () => setBusy(null));
                            }}
                        >
                            {busy === button.function ? <Loading /> : button.label}
                        </PrimaryButton>
                    ) : (
                        <a key={i} href={button.url} target={button.target || undefined} rel={button.target === '_blank' ? 'noopener noreferrer' : undefined}>
                            <PrimaryButton className="h-fit !w-fit">{button.label}</PrimaryButton>
                        </a>
                    ),
                )}
            </div>
        </>
    );
}
