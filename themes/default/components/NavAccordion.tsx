'use client';

import { useState, type ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** Collapsible group in the sidebar (Alpine `activeAccordion` + `x-collapse`). */
export function NavAccordion({ initiallyOpen, icon, active, name, children }: { initiallyOpen: boolean; icon?: string; active: boolean; name: string; children: ReactNode }) {
    const [open, setOpen] = useState(initiallyOpen);
    return (
        <div className="relative w-full mx-auto overflow-hidden text-sm font-normal divide-y divide-gray-200">
            <div className="cursor-pointer">
                <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-between w-full p-3 text-sm font-semibold whitespace-nowrap rounded-lg hover:bg-primary/5">
                    <div className="flex flex-row gap-2">
                        {icon && <Ri name={icon} className={cn('size-5', active ? 'text-primary' : 'fill-base/50')} />}
                        <span>{name}</span>
                    </div>
                    <Ri name="arrow-down-s-line" className={cn('size-4 text-base ease-out duration-300', open && 'rotate-180')} />
                </button>
                <div hidden={!open} style={open ? undefined : { display: 'none' }}>
                    <div className="p-4 pt-0 opacity-70">{children}</div>
                </div>
            </div>
        </div>
    );
}
