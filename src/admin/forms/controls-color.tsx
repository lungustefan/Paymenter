'use client';

import { useEffect, useRef, useState } from 'react';
import { useFieldValue, useInvalidClass } from './runtime';
import { cn } from '@themes/default/components/cn';

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

/** `colorPickerFormComponent`: a text input with a swatch, and a panel with a `vanilla-colorful` picker */
export function ColorPickerControl({
    path,
    id,
    format,
    disabled,
    required,
    placeholder,
    className,
    panelLabel,
    live,
    autoFocus,
}: {
    path: string;
    id: string;
    format: 'hex' | 'hsl' | 'rgb' | 'rgba';
    disabled?: boolean;
    required?: boolean;
    placeholder?: string;
    className: string;
    panelLabel: string;
    live?: Live;
    autoFocus?: boolean;
}) {
    const [value, setValue] = useFieldValue(path);
    const invalid = useInvalidClass(path);
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const picker = useRef<HTMLElement | null>(null);
    const text = typeof value === 'string' ? value : '';
    const tag = `${format === 'hsl' ? 'hsl-string' : format === 'rgb' ? 'rgb-string' : format === 'rgba' ? 'rgba-string' : 'hex'}-color-picker`;

    useEffect(() => {
        void import('vanilla-colorful/hex-color-picker.js');
        void import('vanilla-colorful/hsl-string-color-picker.js');
        void import('vanilla-colorful/rgb-string-color-picker.js');
        void import('vanilla-colorful/rgba-string-color-picker.js');
    }, []);

    useEffect(() => {
        const el = picker.current as any;
        if (!el) return;
        const onChange = (e: CustomEvent) => setValue(e.detail.value, live && !live.onBlur ? { debounce: live.debounce ?? 0 } : undefined);
        el.addEventListener('color-changed', onChange);
        return () => el.removeEventListener('color-changed', onChange);
    }, [open, setValue, live]);

    useEffect(() => {
        if (picker.current && text) (picker.current as any).color = text;
    }, [text, open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={root} className={cn('fi-input-wrp-content', invalid && 'fi-invalid')} style={{ position: 'relative', display: 'flex' }}>
            <input
                aria-controls={`${id}-panel`}
                autoComplete="off"
                disabled={disabled}
                id={id}
                placeholder={placeholder}
                required={required}
                autoFocus={autoFocus}
                type="text"
                className={className}
                value={text}
                onFocus={() => !disabled && setOpen(true)}
                onChange={(e) => setValue(e.target.value, live && !live.onBlur ? { debounce: live.debounce ?? 0 } : undefined)}
                onBlur={() => live && live.onBlur && setValue(text, { ...live })}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen((o) => !o);
                    }
                }}
            />
            <div aria-hidden="true" className={cn('fi-fo-color-picker-preview my-auto me-3 size-5 shrink-0 rounded-full select-none', !text && 'fi-empty')} style={{ backgroundColor: text || undefined }} onClick={() => !disabled && setOpen((o) => !o)} />
            {open && (
                <div id={`${id}-panel`} role="dialog" aria-label={panelLabel} className="fi-fo-color-picker-panel" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 20 }}>
                    {tag === 'hex-color-picker' && <hex-color-picker ref={picker as any} color={text} />}
                    {tag === 'hsl-string-color-picker' && <hsl-string-color-picker ref={picker as any} color={text} />}
                    {tag === 'rgb-string-color-picker' && <rgb-string-color-picker ref={picker as any} color={text} />}
                    {tag === 'rgba-string-color-picker' && <rgba-string-color-picker ref={picker as any} color={text} />}
                </div>
            )}
        </div>
    );
}

declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicElements {
            'hex-color-picker': any;
            'hsl-string-color-picker': any;
            'rgb-string-color-picker': any;
            'rgba-string-color-picker': any;
        }
    }
}
