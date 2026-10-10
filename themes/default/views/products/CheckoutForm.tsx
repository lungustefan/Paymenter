'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToCartAction, pricingAction } from '@/actions/checkout';
import type { CheckoutField } from '@/server/pages/checkout';
import type { PricingView } from '@/server/pages/checkout';
import { PrimaryButton } from '../../components/Button';
import { SelectField } from '../../components/Form';
import { ConfigOptionField } from '../../components/ConfigOption';
import { Loading } from '../../components/Loading';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

export interface CheckoutPlan {
    id: number;
    name: string;
    priceLabel: string;
    hasSetupFee: boolean;
    setupFeeLabel: string;
}

/** Port of views/products/checkout.blade.php + Livewire\Products\Checkout (client state) */
export function CheckoutForm({
    category,
    productSlug,
    productName,
    productImage,
    productDescription,
    plans,
    optionFields,
    configFields,
    initial,
    cartProductKey,
    initialPricing,
    buyable,
}: {
    category: string;
    productSlug: string;
    productName: string;
    productImage: string | null;
    productDescription: string;
    plans: CheckoutPlan[];
    optionFields: CheckoutField[];
    configFields: CheckoutField[];
    initial: { planId: number; configOptions: Record<string, any>; checkoutConfig: Record<string, any> };
    cartProductKey: number | null;
    initialPricing: PricingView;
    buyable: boolean;
}) {
    const { t } = useT();
    const router = useRouter();
    const form = useForm({ plan_id: initial.planId as number | string, configOptions: initial.configOptions, checkoutConfig: initial.checkoutConfig });
    const [pricing, setPricing] = useState<PricingView>(initialPricing);
    const [, startPricing] = useTransition();
    const first = useRef(true);

    // `updatedPlanId` / `updatedConfigOptions`: refresh the total on the server
    useEffect(() => {
        if (first.current) {
            first.current = false;
        } else {
            startPricing(async () => {
                setPricing(await pricingAction({ category, product: productSlug, planId: form.data.plan_id, configOptions: form.data.configOptions }));
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.data.plan_id, JSON.stringify(form.data.configOptions)]);

    // `#[Url(keep: true)]`: keep the selection in the address bar
    useEffect(() => {
        const params = new URLSearchParams();
        params.set('plan', String(form.data.plan_id));
        for (const [k, v] of Object.entries(form.data.configOptions)) if (v !== null && v !== undefined) params.set(`options[${k}]`, String(v));
        for (const [k, v] of Object.entries(form.data.checkoutConfig)) if (v !== null && v !== undefined) params.set(`config[${k}]`, String(v));
        if (cartProductKey) params.set('edit', String(cartProductKey));
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }, [form.data, cartProductKey]);

    const checkout = () =>
        form.run(() =>
            addToCartAction({ category, product: productSlug, planId: form.data.plan_id, configOptions: form.data.configOptions, checkoutConfig: form.data.checkoutConfig, cartProductKey }),
        );
    void router;

    /* eslint-disable @next/next/no-img-element */
    return (
        <div className="container mt-14 flex flex-col md:grid md:grid-cols-4 gap-6">
            <div className="flex flex-col gap-4 w-full col-span-3">
                <h1 className="text-3xl font-bold">{productName}</h1>
                <div className="flex flex-row w-full gap-4">
                    {productImage ? <img src={productImage} alt={productName} className="max-w-40" /> : null}
                    <div className="max-h-28 overflow-y-auto w-full">
                        <article className="prose dark:prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: productDescription }} />
                    </div>
                </div>
                {plans.length > 1 && (
                    <SelectField name="plan_id" label="Select a plan" value={String(form.data.plan_id)} onChange={(e) => form.set('plan_id', e.target.value)} error={form.error('plan_id')}>
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} - {plan.priceLabel}
                                {plan.hasSetupFee ? ` + ${plan.setupFeeLabel} ${t('product.setup_fee')}` : ''}
                            </option>
                        ))}
                    </SelectField>
                )}

                {optionFields.map((option) => {
                    const showPriceTag = (option.children ?? []).some((c) => !c.prices[String(form.data.plan_id)]?.free);
                    const key = String(option.optionId);
                    return (
                        <ConfigOptionField
                            key={key}
                            field={option}
                            name={`configOptions.${key}`}
                            value={form.data.configOptions[key]}
                            onChange={(v) => form.set('configOptions', { ...form.data.configOptions, [key]: v })}
                            planId={form.data.plan_id}
                            showPriceTag={showPriceTag}
                            error={form.error(`configOptions.${key}`)}
                        />
                    );
                })}
                {configFields.map((field) => (
                    <ConfigOptionField
                        key={field.name}
                        field={field}
                        name={`checkoutConfig.${field.name}`}
                        value={form.data.checkoutConfig[field.name]}
                        onChange={(v) => form.set('checkoutConfig', { ...form.data.checkoutConfig, [field.name]: v })}
                        error={form.error(`checkoutConfig.${field.name}`)}
                    />
                ))}
            </div>
            <div className="flex flex-col gap-2 w-full col-span-1 bg-background-secondary p-3 rounded-md h-fit">
                <h2 className="text-2xl font-semibold  mb-2">{t('product.order_summary')}</h2>
                {pricing.hasTax && (
                    <>
                        <div className="font-semibold flex justify-between">
                            <h4>{t('invoices.subtotal')}:</h4> {pricing.subtotal}
                        </div>
                        <div className="font-semibold flex justify-between">
                            <h4>
                                {pricing.taxName} ({pricing.taxRate}%):
                            </h4>{' '}
                            {pricing.totalTax}
                        </div>
                    </>
                )}
                <div className="text-lg font-semibold flex justify-between">
                    <h4>{t('product.total_today')}:</h4> {pricing.total}
                </div>
                {pricing.showThen && (
                    <div className="text- font-semibold flex justify-between ">
                        <h4>{pricing.thenLabel}:</h4> {pricing.thenPrice}
                    </div>
                )}
                {buyable && (
                    <div>
                        <PrimaryButton onClick={checkout} disabled={form.pending}>
                            <Loading show={form.pending} />
                            {!form.pending && <div>{t('product.checkout')}</div>}
                        </PrimaryButton>
                    </div>
                )}
            </div>
        </div>
    );
}
