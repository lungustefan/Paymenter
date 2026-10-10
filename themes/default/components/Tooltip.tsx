'use client';

import { useRef, useState, type ReactNode } from 'react';

/** Port of components/tooltip.blade.php (Alpine anchor): message bubble under the hovered text. */
export function Tooltip({ message, children }: { message: ReactNode; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: 0, top: 0 });

    const show = () => {
        const rect = trigger.current?.getBoundingClientRect();
        if (rect) setPos({ left: rect.left + rect.width / 2, top: rect.bottom + 3 });
        setOpen(true);
    };

    return (
        <div>
            {open && (
                <div
                    className="fixed text-base text-sm w-max p-[5px] rounded bg-background shadow-lg z-10 border border-neutral"
                    style={{ left: pos.left, top: pos.top, transform: 'translateX(-50%)' }}
                    aria-describedby="tooltip"
                >
                    {message}
                    <div className="arrow absolute w-2 h-2 rotate-45 bg-background border-l border-t border-neutral -top-1 left-1/2 -translate-x-1/2"></div>
                </div>
            )}
            <div aria-describedby="tooltip" className="underline decoration-dotted " ref={trigger} onMouseOver={show} onMouseOut={() => setOpen(false)}>
                {children}
            </div>
        </div>
    );
}
