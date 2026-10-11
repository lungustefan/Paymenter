import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Ports of components/form/{input,checkbox,textarea,toggle,select,radio}.blade.php */

interface FieldProps {
    name: string;
    label?: ReactNode;
    required?: boolean;
    divClass?: string | null;
    hideRequiredIndicator?: boolean;
    error?: string | string[] | null;
}

function FieldError({ error }: { error?: string | string[] | null }) {
    const message = Array.isArray(error) ? error[0] : error;
    return message ? <p className="text-red-500 text-xs">{message}</p> : null;
}

function Label({ name, label, required, hideRequiredIndicator }: Pick<FieldProps, 'name' | 'label' | 'required' | 'hideRequiredIndicator'>) {
    if (!label) return null;
    return (
        <label htmlFor={name} className="mb-1 text-sm text-primary-100">
            {label}
            {required && !hideRequiredIndicator && (
                <>
                    {' '}
                    <span className="text-red-500">*</span>
                </>
            )}
        </label>
    );
}

export function Input({
    name,
    label,
    required = false,
    divClass,
    className,
    placeholder,
    id,
    type,
    hideRequiredIndicator = false,
    error,
    ...rest
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'>) {
    return (
        <fieldset className={cn('flex flex-col w-full', divClass)}>
            <Label name={name} label={label} required={required} hideRequiredIndicator={hideRequiredIndicator} />
            <input
                type={type ?? 'text'}
                id={id ?? name}
                name={name}
                className={cn(
                    'block w-full text-sm text-base bg-background-secondary border border-neutral rounded-md shadow-sm focus:outline-none transition-all duration-300 ease-in-out disabled:bg-background-secondary/50 disabled:cursor-not-allowed',
                    className,
                    type !== 'color' && 'px-2.5 py-2.5',
                )}
                placeholder={placeholder ?? (typeof label === 'string' ? label : '')}
                required={required}
                {...rest}
            />
            <FieldError error={error} />
        </fieldset>
    );
}

export function Checkbox({
    name,
    label,
    divClass,
    id,
    error,
    children,
    ...rest
}: { name: string; label?: ReactNode; divClass?: string | null; error?: string | string[] | null; children?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'type'>) {
    return (
        <div className={cn('flex items-center', divClass)}>
            <input
                type="checkbox"
                name={name}
                id={id ?? name}
                {...rest}
                className="form-checkbox size-4 text-primary rounded focus:ring-secondary hover:bg-secondary ring-offset-primary-800 focus:ring-2 bg-background-secondary border-neutral"
            />
            <label className="ml-2 text-sm text-primary-100" htmlFor={id ?? name}>
                {label ?? children}
            </label>
            <FieldError error={error} />
        </div>
    );
}

export function Textarea({
    name,
    label,
    required = false,
    divClass,
    className,
    placeholder,
    id,
    hideRequiredIndicator = false,
    error,
    children,
    ...rest
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
    return (
        <fieldset className={cn('flex flex-col w-full', divClass)}>
            <Label name={name} label={label} required={required} hideRequiredIndicator={hideRequiredIndicator} />
            <textarea
                id={id ?? name}
                name={name}
                className={cn(
                    'block w-full text-sm text-primary-100 bg-primary-800 border-2 border-neutral rounded-md outline-none focus:outline-none focus:border-secondary transition-all duration-300 ease-in-out disabled:bg-primary-700 disabled:cursor-not-allowed',
                    className,
                    'px-2.5 py-2.5',
                )}
                placeholder={placeholder ?? (typeof label === 'string' ? label : '')}
                required={required}
                {...rest}
            >
                {children}
            </textarea>
            <FieldError error={error} />
        </fieldset>
    );
}

export function Toggle({
    label,
    id,
    disabled = false,
    ...rest
}: { label?: ReactNode; id: string; disabled?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'disabled'>) {
    return (
        <label htmlFor={id} className={cn('flex items-center', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
            <div className="relative">
                <input id={id} type="checkbox" className="sr-only peer" disabled={disabled} {...rest} />
                <div className="w-11 h-6 bg-neutral rounded-full peer-checked:bg-primary transition-colors duration-300 ease-in-out"></div>
                <div className="absolute left-[2px] top-[2px] bg-white border-none rounded-full h-5 w-5 peer-checked:translate-x-full transition-transform duration-300 ease-in-out"></div>
            </div>
            {label !== undefined && <span className="ml-3 text-sm font-medium text-base/80">{label}</span>}
        </label>
    );
}

export function SelectField({
    name,
    label,
    required = false,
    divClass,
    hideRequiredIndicator = false,
    multiple = false,
    error,
    className,
    children,
    proTip,
    ...rest
}: FieldProps & { multiple?: boolean; proTip?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'multiple'>) {
    return (
        <fieldset className={cn('flex flex-col w-full', divClass)}>
            <Label name={name} label={label} required={required} hideRequiredIndicator={hideRequiredIndicator} />
            <select
                id={rest.id ?? name}
                multiple={multiple}
                name={`${name}${multiple ? '[]' : ''}`}
                {...rest}
                className={cn(
                    'block px-2.5 py-2.5 w-full text-sm text-primary-100 bg-background-secondary border border-neutral rounded-md outline-none focus:outline-none focus:border-secondary transition-all duration-300 ease-in-out form-select disabled:bg-background-secondary/50 disabled:cursor-not-allowed',
                    className,
                )}
            >
                {children}
            </select>
            {multiple && <p className="text-xs text-base">{proTip ?? 'Pro tip: Hold down the Ctrl (Windows) / Command (Mac) button to select multiple options.'}</p>}
            <FieldError error={error} />
        </fieldset>
    );
}

export function Radio({
    name,
    label,
    required = false,
    divClass,
    hideRequiredIndicator = false,
    error,
    options,
    selected,
    onChange,
}: FieldProps & { options: Record<string, string> | string[]; selected?: string | null; onChange?: (value: string) => void }) {
    const entries = Array.isArray(options) ? options.map((o, i) => [String(i), o] as const) : Object.entries(options);
    return (
        <fieldset className={cn('flex flex-col w-full', divClass)}>
            <Label name={name} label={label} required={required} hideRequiredIndicator={hideRequiredIndicator} />
            <div className="block px-2.5 py-2.5 w-full text-sm text-primary-100 bg-background-secondary border-2 border-neutral rounded-md outline-none focus:outline-none focus:border-secondary transition-all duration-300 ease-in-out">
                {entries.map(([key, option]) => (
                    <div key={key} className="flex items-center gap-2">
                        <input
                            type="radio"
                            id={`${name}_${key}`}
                            name={name}
                            value={Array.isArray(options) ? option : key}
                            checked={selected === option}
                            onChange={() => onChange?.(Array.isArray(options) ? option : key)}
                        />
                        <label htmlFor={`${name}_${key}`}>{option}</label>
                    </div>
                ))}
            </div>
            <FieldError error={error} />
        </fieldset>
    );
}
