'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { Input, Checkbox, SelectField } from './Form';
import { useT } from './Providers';
import { cn } from './cn';
import type { CheckoutField } from '@/server/pages/checkout';

/** Price label of a config option child for the selected plan: `' - $5.00'` or ''. */
function priceTag(child: NonNullable<CheckoutField['children']>[number], planId: string | number | undefined, showPriceTag: boolean): string {
    const p = planId !== undefined ? child.prices[String(planId)] : undefined;
    return showPriceTag && p?.available ? ` - ${p.label}` : '';
}

function RadioBox({ name, label, required, error, children }: { name: string; label?: string; required?: boolean; error?: string[]; children: ReactNode }) {
    return (
        <fieldset className="flex flex-col w-full" {...({ name } as object)}>
            {label && (
                <label htmlFor={name} className="mb-1 text-sm text-primary-100">
                    {label}
                    {required && <span className="text-red-500">*</span>}
                </label>
            )}
            <div className="block px-2.5 py-2.5 w-full text-sm text-primary-100 bg-background-secondary border-2 border-neutral rounded-md outline-none focus:outline-none focus:border-secondary transition-all duration-300 ease-in-out">
                {children}
            </div>
            {error?.[0] && <p className="text-red-500 text-xs">{error[0]}</p>}
        </fieldset>
    );
}

/** Port of the slider type of components/form/configoption.blade.php */
function Slider({ name, field, value, onChange, planId, showPriceTag }: { name: string; field: CheckoutField; value: any; onChange: (v: any) => void; planId?: string | number; showPriceTag: boolean }) {
    const options = field.children ?? [];
    const initial = Math.max(
        0,
        options.findIndex((o) => String(o.id) === String(value)),
    );
    const [selected, setSelected] = useState(initial);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const last = options.length - 1;
    const progress = `${last > 0 ? (selected / last) * 100 : 0}%`;
    const segments = `${last > 0 ? 100 / last : 100}%`;

    const choose = (index: number) => {
        setSelected(index);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(options[index].id), 300);
    };
    useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

    return (
        <div className="flex flex-col gap-1 relative">
            <label htmlFor={name} className="mb-1 text-sm text-primary-100">
                {field.label ?? field.name}
            </label>
            <div className="relative flex items-center" style={{ ['--progress' as string]: progress, ['--segments-width' as string]: segments }}>
                <div
                    className="
                        absolute left-2.5 right-2.5 h-1.5 bg-background-secondary rounded-full overflow-hidden transition-all duration-500 ease-in-out
                        before:absolute before:inset-0 before:bg-primary
                        before:[mask-image:_linear-gradient(to_right,theme(colors.white),theme(colors.white)_var(--progress),transparent_var(--progress))]
                        [&[x-cloak]]:hidden"
                    aria-hidden="true"
                ></div>
                <input
                    className="
                        relative appearance-none cursor-pointer w-full bg-transparent focus:outline-none transition-all duration-500 ease-in-out
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-none
                        [&::-webkit-slider-thumb]:focus:ring-0 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5
                        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-base [&::-moz-range-thumb]:border-none
                        [&::-moz-range-thumb]:shadow-none [&::-moz-range-thumb]:focus:ring-0
                    "
                    type="range"
                    min={0}
                    max={last}
                    value={selected}
                    onChange={(e) => choose(parseInt(e.target.value))}
                    aria-label="Option Slider"
                    name={name}
                    id={name}
                />
            </div>
            <ul className="flex justify-between text-xs font-medium text-light px-2.5">
                {options.map((child, index) => (
                    <li key={child.id} className={cn('relative', showPriceTag ? 'pb-7' : 'pb-2')}>
                        <button type="button" onClick={() => choose(index)} className="absolute flex flex-col items-center -translate-x-1/2">
                            <span className="text-sm font-semibold">{child.name}</span>
                            {showPriceTag && <span className="text-sm font-semibold hidden lg:inline">{priceTag(child, planId, true).replace(/^ - /, '')}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Port of components/form/configoption.blade.php (config options and extension checkout config) */
export function ConfigOptionField({
    field,
    name,
    value,
    onChange,
    planId,
    showPriceTag = false,
    error,
}: {
    field: CheckoutField;
    name: string;
    value: any;
    onChange: (value: any) => void;
    planId?: string | number;
    showPriceTag?: boolean;
    error?: string[];
}) {
    const { t } = useT();
    const label = t(field.label ?? field.name);
    const children = field.children ?? [];
    const required = field.required ?? false;

    let control: ReactNode = null;
    switch (field.type) {
        case 'select':
            control = (
                <SelectField
                    name={name}
                    label={label}
                    required={required}
                    multiple={field.multiple ?? false}
                    value={field.multiple ? (Array.isArray(value) ? value : []) : (value ?? '')}
                    onChange={(e) =>
                        onChange(field.multiple ? Array.from(e.target.selectedOptions).map((o) => o.value) : e.target.value)
                    }
                    error={error}
                >
                    {field.children
                        ? children.map((child) => (
                              <option key={child.id} value={child.id}>
                                  {child.name}
                                  {priceTag(child, planId, showPriceTag) ? ` ${priceTag(child, planId, showPriceTag).replace(/^ - /, '- ')}` : ''}
                              </option>
                          ))
                        : Object.entries(field.options ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>
                                  {v}
                              </option>
                          ))}
                </SelectField>
            );
            break;
        case 'slider':
            control = <Slider name={name} field={field} value={value} onChange={onChange} planId={planId} showPriceTag={showPriceTag} />;
            break;
        case 'text':
        case 'password':
        case 'email':
        case 'number':
        case 'color':
        case 'file':
            control = (
                <Input
                    name={name}
                    type={field.type}
                    label={label}
                    required={required}
                    placeholder={field.placeholder ?? ''}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    error={error}
                />
            );
            break;
        case 'checkbox': {
            const first = children[0];
            const tag = first ? priceTag(first, planId, showPriceTag) : '';
            control = <Checkbox name={name} label={label + tag} required={required} checked={value === true || value === 'true'} onChange={(e) => onChange(e.target.checked)} error={error} />;
            break;
        }
        case 'radio':
            control = (
                <RadioBox name={name} label={label} required={required} error={error}>
                    {field.children
                        ? children.map((child) => (
                              <div className="flex items-center gap-2" key={child.id}>
                                  <input type="radio" id={String(child.id)} name={String(field.optionId)} value={child.id} checked={String(value) === String(child.id)} onChange={() => onChange(child.id)} />
                                  <label htmlFor={String(child.id)}>
                                      {child.name}
                                      {priceTag(child, planId, showPriceTag)}
                                  </label>
                              </div>
                          ))
                        : Object.entries(field.options ?? {}).map(([k, v]) => (
                              <div className="flex items-center gap-2" key={k}>
                                  <input type="radio" id={k} name={field.name} value={k} checked={String(value) === k} onChange={() => onChange(k)} />
                                  <label htmlFor={k}>{v}</label>
                              </div>
                          ))}
                </RadioBox>
            );
            break;
    }

    return (
        <div className="flex flex-col gap-1">
            {control}
            {field.description !== undefined &&
                field.description !== null &&
                (field.link ? (
                    <a href={field.link} className="text-xs text-primary-500 hover:underline hover:text-secondary group">
                        {field.description}
                        <Ri name="arrow-right-long-line" className="ml-1 size-3 inline-block -rotate-45 group-hover:rotate-0 transition" />
                    </a>
                ) : (
                    <p className="text-xs text-primary-500">{field.description}</p>
                ))}
        </div>
    );
}
