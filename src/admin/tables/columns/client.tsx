'use client';

import { useState, type ReactNode } from 'react';
import { useAdminActions } from '../../actions/client';
import { cn } from '@themes/default/components/cn';

/** the switch of a `ToggleColumn` (`toggleTableColumn`): saves on click */
export function ToggleCell({
    tableId,
    column,
    recordKey,
    state,
    disabled,
    label,
    onClass,
    offClass,
    onIcon,
    offIcon,
    className,
    tooltip,
}: {
    tableId: string;
    column: string;
    recordKey: string;
    state: boolean;
    disabled?: boolean;
    label: string;
    onClass: string;
    offClass: string;
    onIcon?: ReactNode;
    offIcon?: ReactNode;
    className: string;
    tooltip?: string | null;
}) {
    const { dispatch, apply } = useAdminActions();
    const [value, setValue] = useState(state);
    const [error, setError] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);

    const toggle = async () => {
        if (disabled || busy) return;
        const next = !value;
        setValue(next);
        setBusy(true);
        setError(undefined);
        try {
            const result = apply(await dispatch({ type: 'table', table: tableId, action: 'toggle', record: recordKey, column, value: next }));
            if (!result.ok) {
                setValue(!next);
                const first = result.errors && Object.values(result.errors)[0]?.[0];
                if (first) setError(first);
            }
        } catch {
            setValue(!next);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={className} title={error ?? tooltip ?? undefined}>
            <input type="hidden" defaultValue={state ? 1 : 0} />
            <div
                aria-checked={value ? 'true' : 'false'}
                aria-disabled={disabled ? 'true' : undefined}
                aria-label={label}
                role="switch"
                tabIndex={disabled ? -1 : 0}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void toggle();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggle();
                    }
                }}
                {...(disabled ? { disabled: true } : {})}
                className={cn('fi-toggle', value ? onClass : offClass)}
            >
                <div>
                    <div aria-hidden="true">{offIcon}</div>
                    <div aria-hidden="true">{onIcon}</div>
                </div>
            </div>
        </div>
    );
}

/** the input of a `TextInputColumn` (`textInputTableColumn`): saves when it loses focus */
export function TextInputCell({
    tableId,
    column,
    recordKey,
    state,
    label,
    disabled,
    wrapperClass,
    inputClass,
    inputProps,
    prefix,
    suffix,
    className,
}: {
    tableId: string;
    column: string;
    recordKey: string;
    state: string | number | null;
    label: string;
    disabled?: boolean;
    wrapperClass: string;
    inputClass: string;
    inputProps: Record<string, any>;
    prefix?: ReactNode;
    suffix?: ReactNode;
    className: string;
}) {
    const { dispatch, apply } = useAdminActions();
    const [value, setValue] = useState(state === null || state === undefined ? '' : String(state));
    const [saved, setSaved] = useState(value);
    const [error, setError] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);

    const save = async () => {
        if (value === saved) return;
        setLoading(true);
        setError(undefined);
        try {
            const result = apply(await dispatch({ type: 'table', table: tableId, action: 'input', record: recordKey, column, value: value.trim() === '' ? null : value }));
            if (result.ok) setSaved(value);
            else {
                const first = result.errors && Object.values(result.errors)[0]?.[0];
                setError(first ?? 'Error');
                setValue(saved);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={className}>
            <input type="hidden" defaultValue={state === null || state === undefined ? '' : String(state)} />
            <div className={cn(wrapperClass, (loading || disabled) && 'fi-disabled', error && 'fi-invalid')} title={error} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                {prefix}
                <div className="fi-input-wrp-content-ctn">
                    <input
                        {...inputProps}
                        aria-label={label}
                        disabled={disabled || loading}
                        className={inputClass}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => void save()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                    />
                </div>
                {suffix}
            </div>
        </div>
    );
}
