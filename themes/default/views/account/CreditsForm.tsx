'use client';

import { useEffect, useRef, useState } from 'react';
import { addCreditAction, creditGatewaysAction } from '@/actions/account';
import { Input, SelectField } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

/** Form of views/client/account/credits.blade.php + Livewire\Client\Credits (client state) */
export function CreditsForm({
    currencies,
    initialCurrency,
    initialAmount,
    initialGateways,
}: {
    currencies: string[];
    initialCurrency: string;
    initialAmount: string;
    initialGateways: { id: number; name: string }[];
}) {
    const { t } = useT();
    const form = useForm({ currency: initialCurrency, amount: initialAmount, gateway: (initialGateways[0]?.id ?? '') as string | number });
    const [gateways, setGateways] = useState(initialGateways);
    const first = useRef(true);

    // `updated('amount' | 'currency')`: the usable gateways depend on both
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const timer = setTimeout(async () => {
            const list = await creditGatewaysAction(form.data.amount, form.data.currency);
            setGateways(list);
            if (list.length > 0 && !list.some((g) => String(g.id) === String(form.data.gateway))) form.set('gateway', list[0].id);
        }, 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.data.amount, form.data.currency]);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                form.run(() => addCreditAction({ currency: form.data.currency, amount: form.data.amount, gateway: form.data.gateway }));
            }}
        >
            {/* Currency and amount */}
            <div className="grid grid-cols-2 gap-4">
                <SelectField label={t('account.input.currency')} required {...form.bind('currency')}>
                    {currencies.map((code) => (
                        <option key={code} value={code}>
                            {code}
                        </option>
                    ))}
                </SelectField>
                <Input
                    type="number"
                    label={t('account.input.amount')}
                    placeholder={t('account.input.amount_placeholder')}
                    required
                    {...form.bind('amount')}
                    // `x-mask:dynamic="$money($input, '.', '', 2)"`: digits with at most two decimals
                    onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d.]/g, '');
                        const [int, ...dec] = cleaned.split('.');
                        form.set('amount', dec.length ? `${int}.${dec.join('').slice(0, 2)}` : int);
                    }}
                />

                <SelectField label={t('product.payment_method')} required {...form.bind('gateway')}>
                    {gateways.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name}
                        </option>
                    ))}
                </SelectField>
            </div>

            <PrimaryButton type="submit" className="w-full mt-4" pending={form.pending}>
                {t('account.add_credit')}
            </PrimaryButton>
        </form>
    );
}
