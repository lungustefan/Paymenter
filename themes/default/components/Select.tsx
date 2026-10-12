'use client';

import { useEffect, useRef, useState } from 'react';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

export interface SelectOption {
    value: string;
    label: string;
}

/** Port of components/select.blade.php: custom listbox select with keyboard support. */
export function Select({
    options,
    value,
    onChange,
    placeholder = 'Select option',
    name,
}: {
    options: SelectOption[];
    value: string | null | undefined;
    onChange: (value: string) => void;
    placeholder?: string;
    name?: string;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState<SelectOption | null>(null);
    const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (!open) return;
        setActive(options.find((o) => o.value === value) ?? options[0] ?? null);
        const onClick = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, [open, options, value]);

    useEffect(() => {
        if (!open || !button.current || !list.current) return;
        const bottom = button.current.getBoundingClientRect().top + button.current.offsetHeight + list.current.offsetHeight;
        setPosition(window.innerHeight < bottom ? 'top' : 'bottom');
    }, [open]);

    useEffect(() => {
        if (open && active) document.getElementById(`${name ?? 'select'}-${active.value}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open, name]);

    const move = (delta: number) => {
        const i = active ? options.indexOf(active) : -1;
        const next = options[Math.min(Math.max(i + delta, 0), options.length - 1)];
        if (next) setActive(next);
    };

    return (
        <div
            ref={root}
            className="relative w-full"
            onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    open ? move(1) : setOpen(true);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    open ? move(-1) : setOpen(true);
                } else if (e.key === 'Enter' && open) {
                    e.preventDefault();
                    if (active) onChange(active.value);
                    setOpen(false);
                }
            }}
        >
            <button
                ref={button}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'relative w-full min-h-[38px] py-2 pl-3 pr-10 text-left bg-background-secondary border border-neutral rounded-md shadow-sm cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-800',
                    open && 'ring-2 ring-offset-2 ring-neutral-800',
                )}
            >
                <span className="block truncate">{options.find((o) => o.value === value)?.label ?? placeholder}</span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <Ri name="expand-up-down-line" className="size-4" />
                </span>
            </button>

            {open && (
                <ul
                    ref={list}
                    className={cn(
                        'absolute z-50 w-full py-1 overflow-auto bg-background-secondary border border-neutral rounded-lg shadow-lg max-h-60 focus:outline-none text-sm',
                        position === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
                    )}
                >
                    {options.map((item) => (
                        <li
                            key={item.value}
                            id={`${name ?? 'select'}-${item.value}`}
                            onClick={() => {
                                onChange(item.value);
                                setOpen(false);
                            }}
                            onMouseMove={() => setActive(item)}
                            className={cn('relative py-2 pl-8 pr-4 cursor-pointer select-none hover:bg-neutral-700', active?.value === item.value && 'bg-neutral-700')}
                        >
                            <span className={cn('block truncate', item.value === value && 'font-semibold')}>{item.label}</span>
                            {item.value === value && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-neutral-400">
                                    <Ri name="check-fill" className="size-4" />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
