'use client';

import Link from 'next/link';
import { useState } from 'react';
import { applyCouponAction, checkoutAction, removeCouponAction, removeProductAction, updateQuantityAction } from '@/actions/cart';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Button';
import { Input, Checkbox } from '../components/Form';
import { Loading } from '../components/Loading';
import { useForm } from '../components/useForm';
import { useT } from '../components/Providers';

export interface CartItemView {
    id: number;
    productName: string;
    options: { name: string; value: string }[];
    lineTotal: string;
    eachPrice: string | null;
    quantity: number;
    allowQuantity: boolean;
    editUrl: string;
}

export interface CartTotals {
    subtotal: string;
    tax: string | null;
    taxName: string;
    taxRate: string;
    total: string;
}

/** Port of views/cart.blade.php + Livewire\Cart (client state) */
export function CartView({ items, totals, coupon, tos }: { items: CartItemView[]; totals: CartTotals | null; coupon: string | null; tos: string | null }) {
    const { t } = useT();
    const form = useForm({ coupon: '', tos: false });
    const [busy, setBusy] = useState<string | null>(null);

    const act = (key: string, fn: () => Promise<any>) => {
        setBusy(key);
        form.run(fn, () => setBusy(null));
    };

    return (
        <div className="container mt-14">
            <div className="flex flex-col md:grid md:grid-cols-4 gap-8">
                <div className="flex flex-col col-span-3 gap-4">
                    {items.length === 0 && <h1 className="text-2xl font-semibold">{t('product.empty_cart')}</h1>}
                    {items.map((item) => (
                        <div key={item.id} className="flex flex-row justify-between w-full bg-background-secondary p-3 rounded-md border border-neutral">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-2xl font-semibold">{item.productName}</h2>
                                <p className="text-sm">
                                    {item.options.map((option, i) => (
                                        <span key={i}>
                                            {option.name}: {option.value}
                                            <br />
                                        </span>
                                    ))}
                                </p>
                            </div>
                            <div className="flex flex-col justify-between items-end gap-4">
                                <h3 className="text-xl font-semibold p-1">
                                    {item.lineTotal} {item.quantity > 1 && <>({item.eachPrice} each)</>}
                                </h3>
                                <div className="flex flex-row gap-2">
                                    {item.allowQuantity && (
                                        <div className="flex flex-row gap-1 items-center mr-4">
                                            <SecondaryButton onClick={() => act(`q${item.id}`, () => updateQuantityAction(item.id, item.quantity - 1))} className="h-full !w-fit">
                                                -
                                            </SecondaryButton>
                                            <Input className="h-10 text-center" disabled divClass="!mt-0 !w-14" value={item.quantity} readOnly name="quantity" />
                                            <SecondaryButton onClick={() => act(`q${item.id}`, () => updateQuantityAction(item.id, item.quantity + 1))} className="h-full !w-fit">
                                                +
                                            </SecondaryButton>
                                        </div>
                                    )}
                                    <Link href={item.editUrl}>
                                        <PrimaryButton className="h-fit w-fit">{t('product.edit')}</PrimaryButton>
                                    </Link>
                                    <DangerButton onClick={() => act(`r${item.id}`, () => removeProductAction(item.id))} className="h-fit !w-fit">
                                        <Loading show={busy === `r${item.id}`} />
                                        {busy !== `r${item.id}` && <div>{t('product.remove')}</div>}
                                    </DangerButton>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-4">
                    {items.length > 0 && totals && (
                        <div className="flex flex-col gap-2 w-full col-span-1 bg-background-secondary p-3 rounded-md border border-neutral">
                            <h2 className="text-2xl font-semibold mb-3">{t('product.order_summary')}</h2>
                            <div className="font-semibold flex items-end gap-2">
                                {!coupon ? (
                                    <>
                                        <Input label="Coupon" {...form.bind('coupon')} />
                                        <PrimaryButton onClick={() => act('apply', () => applyCouponAction(form.data.coupon))} className="h-fit !w-fit mb-0.5" disabled={busy === 'apply'}>
                                            <Loading show={busy === 'apply'} />
                                            {busy !== 'apply' && <div>{t('product.apply')}</div>}
                                        </PrimaryButton>
                                    </>
                                ) : (
                                    <div className="flex justify-between items-center w-full">
                                        <h4 className="text-center w-full">{coupon}</h4>
                                        <SecondaryButton onClick={() => act('remove', () => removeCouponAction())} className="h-fit !w-fit">
                                            {t('product.remove')}
                                        </SecondaryButton>
                                    </div>
                                )}
                            </div>
                            <div className="font-semibold flex justify-between">
                                <h4>{t('invoices.subtotal')}:</h4> {totals.subtotal}
                            </div>
                            {totals.tax && (
                                <div className="font-semibold flex justify-between">
                                    <h4>
                                        {totals.taxName} ({totals.taxRate}%):
                                    </h4>{' '}
                                    {totals.tax}
                                </div>
                            )}
                            <div className="text-lg font-semibold flex justify-between mt-1">
                                <h4>{t('invoices.total')}:</h4> {totals.total}
                            </div>

                            <div className="flex flex-col gap-2 w-full col-span-1">
                                {tos && (
                                    <Checkbox {...form.bindChecked('tos')}>
                                        {t('product.tos')}{' '}
                                        <a href={tos} target="_blank" className="text-primary hover:text-primary/80">
                                            {t('product.tos_link')}
                                        </a>
                                    </Checkbox>
                                )}

                                <div className="flex flex-row justify-end gap-2">
                                    <PrimaryButton onClick={() => act('checkout', () => checkoutAction({ tos: form.data.tos }))} className="h-fit" disabled={busy === 'checkout'}>
                                        <Loading show={busy === 'checkout'} />
                                        {busy !== 'checkout' && <div>{t('product.checkout')}</div>}
                                    </PrimaryButton>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
