'use client';

import { useEffect, useRef, useState } from 'react';
import { upgradeAction, upgradeTotalAction } from '@/actions/services';
import type { CheckoutField } from '@/server/pages/checkout';
import { PrimaryButton } from '../../components/Button';
import { ConfigOptionField } from '../../components/ConfigOption';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';
import { cn } from '../../components/cn';

export interface UpgradeProduct {
    id: number;
    name: string;
    image: string | null;
    description: string;
    priceLabel: string;
    options: CheckoutField[];
}

/** Port of views/services/upgrade.blade.php + Livewire\Services\Upgrade (client state) */
export function UpgradeForm({
    serviceId,
    serviceName,
    currentProductId,
    products,
    initialStep,
    initialTotal,
    initialConfigOptions,
    smallImages,
}: {
    serviceId: number;
    serviceName: string;
    currentProductId: number;
    products: UpgradeProduct[];
    initialStep: number;
    initialTotal: string;
    initialConfigOptions: Record<string, Record<string, any>>;
    smallImages: boolean;
}) {
    const { t } = useT();
    const [step, setStep] = useState(initialStep);
    const [upgrade, setUpgrade] = useState<number>(currentProductId);
    const form = useForm({ configOptions: (initialStep === 2 ? initialConfigOptions[String(currentProductId)] : {}) as Record<string, any> });
    const [total, setTotal] = useState(initialTotal);
    const first = useRef(true);

    const upgradeProduct = products.find((p) => p.id === upgrade)!;
    const hasConfig = upgradeProduct.options.length > 0;

    // `totalToday` is recomputed whenever the product or the options change
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        let cancelled = false;
        upgradeTotalAction(serviceId, upgrade, form.data.configOptions).then((v) => !cancelled && setTotal(v));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [upgrade, JSON.stringify(form.data.configOptions)]);

    const nextStep = () => {
        form.set('configOptions', initialConfigOptions[String(upgrade)] ?? {});
        setStep(2);
    };

    const submit = () => {
        if (hasConfig && step === 1) return nextStep();
        form.run(() => upgradeAction(serviceId, upgrade, form.data.configOptions));
    };

    const card = (product: UpgradeProduct, isCurrent: boolean) => (
        <div key={product.id}>
            <input type="radio" name="upgrade" value={product.id} checked={upgrade === product.id} onChange={() => setUpgrade(product.id)} className="hidden peer" id={`product-${product.id}`} />
            <label
                htmlFor={`product-${product.id}`}
                className="flex flex-col cursor-pointer bg-background-secondary hover:bg-background-secondary/80 border border-neutral peer-checked:border-secondary p-4 rounded-lg"
            >
                {isCurrent ? (
                    <div className="rounded-full border border-background rounded-selector inline-flex items-center justify-center gap-2 align-middle bg-primary/60 w-fit px-2 py-0.5">
                        <p className="">{t('services.current_plan')}</p>
                    </div>
                ) : (
                    upgrade === product.id && (
                        <div className="rounded-full border border-background rounded-selector inline-flex items-center justify-center gap-2 align-middle bg-primary w-fit px-2 py-0.5">
                            <p className="">{t('services.new_plan')}</p>
                        </div>
                    )
                )}
                {smallImages ? (
                    <div className="flex gap-x-3 items-center">
                        {product.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={product.image} alt={product.name} className="rounded-md w-14 h-fit" /> : null}
                        <h2 className="text-xl font-bold">{product.name}</h2>
                    </div>
                ) : (
                    <>
                        {product.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={product.image} alt={product.name} className="rounded-md w-full object-cover object-center" /> : null}
                        <h2 className="text-xl font-bold">{product.name}</h2>
                    </>
                )}
                <article className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: product.description }} />
                <h3 className="text-lg font-semibold mb-2">{product.priceLabel}</h3>
            </label>
        </div>
    );

    return (
        <div className="container mt-14">
            <h1 className="text-2xl font-bold">{t('services.upgrade_service', { service: serviceName })}</h1>

            <h2 className="text-lg font-semibold mt-4">{step === 1 ? t('services.upgrade_choose_product') : t('services.upgrade_choose_config')}</h2>

            <div className="grid grid-cols-3 gap-6 mt-2">
                <div className="grid md:grid-cols-2 gap-6 col-span-2">
                    {step === 1 ? (
                        products.map((product) => card(product, product.id === currentProductId))
                    ) : (
                        <div className="col-span-2 flex flex-col gap-4">
                            {upgradeProduct.options.map((option) => {
                                const key = String(option.optionId);
                                return (
                                    <ConfigOptionField
                                        key={key}
                                        field={option}
                                        name={`configOptions.${key}`}
                                        value={form.data.configOptions[key]}
                                        onChange={(v) => form.set('configOptions', { ...form.data.configOptions, [key]: v })}
                                        planId="0"
                                        showPriceTag={option.showPriceTag}
                                        error={form.error(`configOptions.${key}`)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-2 w-full col-span-1 bg-background-secondary p-3 rounded-md h-fit">
                    <h4 className="text-lg font-semibold">{t('services.upgrade_summary')}:</h4>

                    <div className="flex items-center text-base">
                        <span className="mr-2">{t('services.current_plan')}:</span>
                        <span className="text-base/50">{serviceName}</span>
                    </div>
                    {upgrade !== currentProductId && (
                        <div className="flex items-center text-base">
                            <span className="mr-2">{t('services.new_plan')}:</span>
                            <span className="text-base/50">{upgradeProduct ? upgradeProduct.name : t('general.select_plan')}</span>
                        </div>
                    )}

                    <div className="flex items-center text-base">
                        <span className="mr-2">{t('services.total_today')}:</span>
                        <span className="text-base/50">{total}</span>
                    </div>

                    <div className="flex flex-row justify-end gap-2 mt-2">
                        <PrimaryButton className={cn('h-fit')} onClick={submit} disabled={form.pending}>
                            {hasConfig && step === 1 ? <span>{t('services.next_step')}</span> : <span>{t('services.upgrade')}</span>}
                        </PrimaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
}
