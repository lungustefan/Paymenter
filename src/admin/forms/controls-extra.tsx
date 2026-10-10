'use client';

import { useFormContext, useFieldValue } from './runtime';

/** Alpine mask's `$money($input, decimal, thousands, precision)` */
export function formatMoney(input: string, decimal = '.', thousands = '', precision = 2): string {
    if (input === '-') return '-';
    if (/^\D+$/.test(input) && !input.includes(decimal)) return '';
    const minus = input.startsWith('-') ? '-' : '';
    const escaped = decimal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripped = input.replace(new RegExp(`[^0-9${escaped}]`, 'g'), '');
    const [whole, ...rest] = stripped.split(decimal);
    let out = whole;
    if (thousands) out = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
    if (precision > 0 && input.includes(decimal)) out += decimal + (rest.join('') ?? '').slice(0, precision);
    return minus + out;
}

type InputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange'>;

/** a text input with the money mask of Filament (`->mask(RawJs::make('$money($input, ".", "", 2)'))`) */
export function MoneyInput({ path, live, money, ...attrs }: { path: string; live?: { onBlur?: boolean; debounce?: number } | false; money: { decimal: string; thousands: string; precision: number } } & InputProps) {
    const [value, setValue] = useFieldValue(path);
    const { blur } = useFormContext();
    return (
        <input
            {...attrs}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => setValue(formatMoney(e.target.value, money.decimal, money.thousands, money.precision), live ? (live.onBlur ? live : { debounce: live.debounce ?? 500 }) : undefined)}
            onBlur={() => blur(path, live)}
        />
    );
}
