'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAdminActions } from '../actions/client';

/** one message of the conversation; the last one is scrolled into view (`x-init="$el.scrollIntoView()"`) */
export function MessageBox({ className, last, children }: { className: string; last: boolean; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (last) ref.current?.scrollIntoView();
    }, [last]);
    return (
        <div ref={ref} className={className}>
            {children}
        </div>
    );
}

/** `wire:click="deleteMessage(id)"` */
export function DeleteMessageButton({ id, children }: { id: number | string; children: ReactNode }) {
    const { dispatch, apply } = useAdminActions();
    return (
        <button className="dark:text-danger-300 text-danger-600 p-0" onClick={async () => apply(await dispatch({ type: 'page', method: 'deleteMessage', args: [Number(id)] }))}>
            {children}
        </button>
    );
}

/** the "Imported from email" modal of a message (`x-filament::modal`) */
export function MailLogModal({ heading, trigger, children }: { heading: string; trigger: ReactNode; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    return (
        <>
            <div className="fi-modal-trigger" onClick={() => setOpen(true)}>
                {trigger}
            </div>
            {open && (
                <div aria-modal="true" role="dialog" tabIndex={-1} className="fi-modal fi-absolute-positioning-context fi-modal-open">
                    <div aria-hidden="true" className="fi-modal-close-overlay"></div>
                    <div
                        className="fi-modal-window-ctn fi-clickable"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setOpen(false);
                        }}
                    >
                        <div className="fi-modal-window fi-modal-window-has-close-btn fi-modal-window-has-content fi-align-start fi-width-4xl">
                            <div className="fi-modal-header">
                                <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fi-icon-btn fi-size-md fi-modal-close-btn">
                                    ×
                                </button>
                                <h2 className="fi-modal-heading">{heading}</h2>
                            </div>
                            <div className="fi-modal-content">{children}</div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
