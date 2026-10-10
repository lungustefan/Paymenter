'use client';

import { useState, type ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { createBillingAgreementAction, removePaymentMethodAction } from '@/actions/account';
import { PrimaryButton, DangerButton } from '../../components/Button';
import { SelectField } from '../../components/Form';
import { Modal } from '../../components/Modal';
import { Loading } from '../../components/Loading';
import { useForm } from '../../components/useForm';
import { useConfirm, useT } from '../../components/Providers';

/** Add payment method button + setup modal (`?setup`) */
export function AddPaymentMethod({ gateways, initiallyOpen }: { gateways: { id: number; name: string }[]; initiallyOpen: boolean }) {
    const { t } = useT();
    const form = useForm({ gateway: String(gateways[0]?.id ?? '') });
    const [open, setOpen] = useState(initiallyOpen);
    const [setup, setSetup] = useState<ReactNode>(null);

    const create = () =>
        form.startTransition(async () => {
            const result = form.apply(await createBillingAgreementAction(form.data.gateway));
            if (result.view) setSetup(result.view);
        });

    const toggle = (next: boolean) => {
        setOpen(next);
        const url = new URL(window.location.href);
        if (next) url.searchParams.set('setup', 'true');
        else url.searchParams.delete('setup');
        window.history.replaceState(null, '', url.toString());
        // If we have only one gateway, we can auto-select them
        if (next && gateways.length === 1) create();
    };

    return (
        <>
            <PrimaryButton className="h-fit !w-fit" onClick={() => toggle(true)}>
                <Ri name="add-line" className="size-4" />
                {t('account.add_payment_method')}
            </PrimaryButton>
            <Modal
                open={open}
                title={t('account.payment_methods')}
                onClose={() => toggle(false)}
                closeTrigger={
                    <div className="flex gap-4">
                        <button onClick={() => toggle(false)} className="text-primary-100">
                            <Ri name="close-fill" className="size-6" />
                        </button>
                    </div>
                }
            >
                {gateways.length > 1 ? (
                    <SelectField label={t('account.input.payment_gateway')} required {...form.bind('gateway')}>
                        {gateways.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </SelectField>
                ) : gateways.length === 0 ? (
                    <p className="text-sm text-red-500">{t('account.no_payment_gateways_available')}</p>
                ) : null}
                <PrimaryButton className="w-full mt-4" onClick={create} disabled={form.pending}>
                    <Loading show={form.pending} />
                    {!form.pending && <div>{t('account.setup_payment_method')}</div>}
                </PrimaryButton>
                <Modal
                    open={setup !== null}
                    title={t('account.setup_payment_method')}
                    onClose={() => undefined}
                    closeTrigger={
                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    if (window.confirm('Are you sure?')) {
                                        setSetup(null);
                                        toggle(false);
                                    }
                                }}
                                className="text-primary-100"
                            >
                                <Ri name="close-fill" className="size-6" />
                            </button>
                        </div>
                    }
                >
                    <div className="mt-8">{setup}</div>
                </Modal>
            </Modal>
        </>
    );
}

export function RemovePaymentMethod({ ulid, name }: { ulid: string; name: string }) {
    const { t } = useT();
    const confirm = useConfirm();
    const form = useForm({});
    return (
        <DangerButton
            className="!px-2"
            onClick={() =>
                confirm({
                    title: t('account.remove_payment_method'),
                    message: t('account.remove_payment_method_confirm', { name }),
                    confirmText: t('account.confirm'),
                    cancelText: t('account.cancel'),
                    callback: async () => {
                        form.apply(await removePaymentMethodAction(ulid));
                    },
                })
            }
        >
            <Ri name="delete-bin-line" className="size-4" />
        </DangerButton>
    );
}
