'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** Port of components/dropdown.blade.php (Alpine). */
export function Dropdown({
    trigger,
    children,
    width,
    showArrow = true,
}: {
    trigger: ReactNode;
    children: ReactNode;
    width?: string | null;
    showArrow?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [adjustWidth, setAdjustWidth] = useState(0);
    const panel = useRef<HTMLDivElement>(null);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setAdjustWidth(0);
        const id = requestAnimationFrame(() => {
            const rect = panel.current?.getBoundingClientRect();
            if (rect) setAdjustWidth(rect.right > window.innerWidth ? rect.width - 40 : 0);
        });
        const onClick = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('click', onClick);
        return () => {
            cancelAnimationFrame(id);
            document.removeEventListener('click', onClick);
        };
    }, [open]);

    return (
        <div className="relative" ref={root}>
            <button
                type="button"
                className="flex flex-row items-center px-2 py-1 text-sm font-semibold whitespace-nowrap text-base hover:text-base/80"
                onClick={() => setOpen((o) => !o)}
            >
                {trigger}
                {showArrow && <Ri name="arrow-down-s-line" className={cn('md:block hidden size-4 text-base ease-out duration-300', open && '-rotate-180')} />}
            </button>

            {open && (
                <div
                    ref={panel}
                    className={cn('absolute mt-2 px-2 py-1 bg-background-secondary rounded-md shadow-lg z-10 border border-neutral', width ?? 'w-48')}
                    style={{ left: `-${adjustWidth}px` }}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
