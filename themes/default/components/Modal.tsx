'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** Port of components/modal.blade.php (teleported to <body>). */
export function Modal({
    open,
    onClose,
    title = '',
    closable = true,
    closeTrigger,
    width = 'max-w-3xl',
    children,
}: {
    open: boolean;
    onClose?: () => void;
    title?: ReactNode;
    closable?: boolean;
    closeTrigger?: ReactNode;
    width?: string;
    children: ReactNode;
}) {
    // portals only exist in the browser: render nothing on the server and while hydrating
    const mounted = useSyncExternalStore(
        () => () => undefined,
        () => true,
        () => false,
    );

    useEffect(() => {
        if (!open || !onClose) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closable && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, closable]);

    if (!open || !mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/50">
            <div
                className={cn(
                    "px-6 py-4 w-full mx-2 md:mx-auto text-left bg-background-secondary rounded shadow-lg max-h-[calc(100%-theme('spacing.8'))] overflow-y-auto mb-8 mt-8",
                    width,
                )}
            >
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold text-primary-100">{title}</h2>
                    {closable && !closeTrigger && (
                        <button type="button" onClick={onClose} className="text-primary-100">
                            <Ri name="close-fill" className="size-6" />
                        </button>
                    )}
                    {closable && closeTrigger}
                </div>
                <div className="mt-4">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
