'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Dropdown } from './Dropdown';
import { Select } from './Select';
import { useNotify } from './Providers';
import { setCurrency, setLocale } from '@/actions/shell';

/** Port of Livewire\Components\LocaleSwitch + components/locale-switch.blade.php */
export function LocaleSwitch({
    locales,
    currencies,
    currentLocale,
    currentCurrency,
    cartEmpty,
}: {
    locales: { value: string; label: string }[];
    currencies: { value: string; label: string }[];
    currentLocale: string;
    currentCurrency: string;
    cartEmpty: boolean;
}) {
    const router = useRouter();
    const notify = useNotify();
    const [, startTransition] = useTransition();
    const [locale, setLocaleState] = useState(currentLocale);
    const [currency, setCurrencyState] = useState(currentCurrency);

    const showCurrency = currencies.length > 1 && cartEmpty;
    if (!(showCurrency || locales.length > 1)) return null;

    const run = (fn: () => ReturnType<typeof setLocale>, revert: () => void) =>
        startTransition(async () => {
            const res = await fn();
            if (res.notify) notify(res.notify.message, res.notify.type);
            if (!res.ok) revert();
            else router.refresh();
        });

    return (
        <Dropdown
            trigger={
                <div className="text-sm text-base font-semibold text-nowrap">
                    {locales.length > 1 && <> {locales.find((l) => l.value === currentLocale)?.label ?? currentLocale} </>}
                    {locales.length > 1 && showCurrency && <span className="text-base/50 font-semibold">|</span>}
                    {showCurrency && <> {currencies.find((c) => c.value === currentCurrency)?.label ?? currentCurrency} </>}
                </div>
            }
        >
            {locales.length > 1 && (
                <div>
                    <strong className="block p-2 text-xs font-semibold uppercase text-base/50"> Language </strong>
                    <Select
                        options={locales}
                        value={locale}
                        placeholder="Select language"
                        onChange={(v) => {
                            setLocaleState(v);
                            run(() => setLocale(v), () => setLocaleState(currentLocale));
                        }}
                    />
                </div>
            )}
            {showCurrency && (
                <div>
                    <strong className="block p-2 text-xs font-semibold uppercase text-base/50"> Currency </strong>
                    <Select
                        options={currencies}
                        value={currency}
                        placeholder="Select currency"
                        onChange={(v) => {
                            setCurrencyState(v);
                            run(() => setCurrency(v), () => setCurrencyState(currentCurrency));
                        }}
                    />
                </div>
            )}
        </Dropdown>
    );
}
