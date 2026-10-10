'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useModalLayer } from './client';
import { useFormContext } from '../forms/runtime';
import { LoadingIndicator } from '../ui/Icon';

/** `<div class="fi-modal ...">`: the overlay + window container of an open action modal */
export function ModalFrame({ id, className, alert, closeByClickingAway = true, closeByEscaping = true, ariaLabelledby, ariaDescribedby, children }: { id: string; className: string; alert: boolean; closeByClickingAway?: boolean; closeByEscaping?: boolean; ariaLabelledby?: string; ariaDescribedby?: string; children: ReactNode }) {
    const { close } = useModalLayer();
    const ref = useRef<HTMLDivElement>(null);

    // scroll lock + focus
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // `x-trap`: the first tabbable element of the modal gets the focus
        const first = ref.current?.querySelector<HTMLElement>('.fi-modal-window :is(a[href], button, input:not([type=hidden]), select, textarea, [tabindex]):not([tabindex="-1"]):not(:disabled)');
        (first ?? ref.current)?.focus();
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    useEffect(() => {
        if (!closeByEscaping) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // only the topmost modal reacts
            const all = document.querySelectorAll('.fi-modal.fi-modal-open');
            if (all[all.length - 1] === ref.current) close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close, closeByEscaping]);

    return (
        <div ref={ref} aria-describedby={ariaDescribedby} aria-labelledby={ariaLabelledby} aria-modal="true" id={id} role={alert ? 'alertdialog' : 'dialog'} tabIndex={-1} data-fi-modal-id={id} className={className}>
            <div aria-hidden="true" className="fi-modal-close-overlay"></div>
            <div
                className={`fi-modal-window-ctn${closeByClickingAway ? ' fi-clickable' : ''}`}
                onClick={(e) => {
                    if (closeByClickingAway && e.target === e.currentTarget) close();
                }}
            >
                {children}
            </div>
        </div>
    );
}

/** the `x` of the modal header */
export function ModalCloseButton({ className, label, children }: { className: string; label: string; children: ReactNode }) {
    const { close } = useModalLayer();
    return (
        <button className={className} title={label} aria-label={label} tabIndex={-1} type="button" onClick={close}>
            {children}
        </button>
    );
}

/** footer: submit the modal's form */
export function ModalSubmitButton({ className, children }: { className: string; children: ReactNode }) {
    const { submitting } = useFormContext();
    return (
        <button type="submit" className={className} disabled={submitting}>
            {submitting && <LoadingIndicator />}
            <span>{children}</span>
        </button>
    );
}

/** footer: a button that submits the form with extra arguments (`createAnother`) */
export function ModalExtraButton({ className, args, children }: { className: string; args: Record<string, any>; children: ReactNode }) {
    const { submitting, submit } = useFormContext();
    return (
        <button type="button" className={className} disabled={submitting} onClick={() => submit(args)}>
            {submitting && <LoadingIndicator />}
            {children}
        </button>
    );
}

/** footer: cancel */
export function ModalCancelButton({ className, children }: { className: string; children: ReactNode }) {
    const { close } = useModalLayer();
    return (
        <button type="button" className={className} onClick={close}>
            {children}
        </button>
    );
}
