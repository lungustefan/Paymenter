'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFormContext, useFieldValue, useInvalidClass } from './runtime';
import { cn } from '@themes/default/components/cn';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

/** `<div class="fi-input-wrp">`: gets `fi-invalid` while the field has errors */
export function Wrp({ path, className, disabled, children }: { path: string; className: string; disabled?: boolean; children: ReactNode }) {
    const invalid = useInvalidClass(path);
    return <div className={cn(className, disabled && 'fi-disabled', invalid && 'fi-invalid')}>{children}</div>;
}

type InputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'path' | 'defaultValue'>;

/** `<input class="fi-input">` bound to a state path (`wire:model`) */
export function TextInputControl({ path, live, className, ...attrs }: { path: string; live?: Live; className?: string } & InputProps) {
    const [value, setValue] = useFieldValue(path);
    const { blur } = useFormContext();
    return (
        <input
            {...attrs}
            className={className}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => setValue(e.target.value, live === undefined ? undefined : live && !live.onBlur ? { debounce: live.debounce ?? 500 } : live)}
            onBlur={() => blur(path, live)}
        />
    );
}

/** `<select class="fi-select-input">` (the native select) */
export function SelectControl({ path, live, className, options, placeholder, ...attrs }: { path: string; live?: Live; className?: string; options: Array<{ value: string; label: string; disabled?: boolean } | { group: string; options: Array<{ value: string; label: string; disabled?: boolean }> }>; placeholder?: string | null } & Omit<React.ComponentProps<'select'>, 'value' | 'onChange'>) {
    const [value, setValue] = useFieldValue(path);
    const { blur } = useFormContext();
    return (
        <select {...attrs} className={className} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => setValue(e.target.value === '' ? null : e.target.value, live && !live.onBlur ? { ...live, debounce: 0 } : undefined)} onBlur={() => blur(path, live)}>
            {placeholder !== undefined && placeholder !== null && <option value="">{attrs.disabled ? '' : placeholder}</option>}
            {options.map((o) =>
                'group' in o ? (
                    <optgroup key={o.group} label={o.group}>
                        {o.options.map((g) => (
                            <option key={g.value} value={g.value} disabled={g.disabled}>
                                {g.label}
                            </option>
                        ))}
                    </optgroup>
                ) : (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                        {o.label}
                    </option>
                ),
            )}
        </select>
    );
}

/** `<textarea>` with the optional autosize of Filament */
export function TextareaControl({ path, live, autosize, ...attrs }: { path: string; live?: Live; autosize?: boolean } & Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'>) {
    const [value, setValue] = useFieldValue(path);
    const { blur } = useFormContext();
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (!autosize || !ref.current) return;
        ref.current.style.height = '0px';
        ref.current.style.height = `${ref.current.scrollHeight}px`;
    }, [value, autosize]);
    return (
        <textarea
            {...attrs}
            ref={ref}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => setValue(e.target.value, live === undefined ? undefined : live && !live.onBlur ? { debounce: live.debounce ?? 500 } : live)}
            onBlur={() => blur(path, live)}
        />
    );
}

/** the toggle switch (`fi-fo-toggle`) */
export function ToggleControl({ path, live, id, disabled, onClass, offClass, onIcon, offIcon, className }: { path: string; live?: Live; id: string; disabled?: boolean; onClass: string; offClass: string; onIcon?: ReactNode; offIcon?: ReactNode; className?: string }) {
    const [value, setValue] = useFieldValue(path);
    const on = !!value && value !== '0' && value !== 'false';
    return (
        <button
            role="switch"
            type="button"
            aria-checked={on ? 'true' : 'false'}
            id={id}
            disabled={disabled}
            onClick={() => setValue(!on, live ? { ...live, debounce: 0 } : undefined)}
            className={cn('fi-fo-toggle', 'fi-toggle', on ? onClass : offClass, className)}
        >
            <div>
                <div aria-hidden="true">{offIcon}</div>
                <div aria-hidden="true">{onIcon}</div>
            </div>
        </button>
    );
}

/** `<input type="checkbox" class="fi-checkbox-input">` */
export function CheckboxControl({ path, live, className, ...attrs }: { path: string; live?: Live; className?: string } & Omit<InputProps, 'type'>) {
    const [value, setValue] = useFieldValue(path);
    const invalid = useInvalidClass(path);
    return <input {...attrs} type="checkbox" className={cn(className, invalid ? 'fi-invalid' : 'fi-valid')} checked={!!value} onChange={(e) => setValue(e.target.checked, live ? { ...live, debounce: 0 } : undefined)} />;
}

/** `<input type="hidden">` is not part of the DOM of Filament forms (state only); nothing to render */
