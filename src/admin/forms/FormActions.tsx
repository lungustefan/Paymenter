'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useFormContext } from './runtime';
import { LoadingIndicator } from '../ui/Icon';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function useBinding(ref: React.RefObject<HTMLElement | null>, binding: string | undefined, run: () => void) {
    useEffect(() => {
        if (!binding) return;
        const parts = binding.toLowerCase().split('+');
        const key = parts.pop()!;
        const onKey = (e: KeyboardEvent) => {
            const mod = isMac() ? e.metaKey : e.ctrlKey;
            if (e.key.toLowerCase() === key && (!parts.includes('mod') || mod) && (!parts.includes('shift') || e.shiftKey) && (parts.includes('shift') || !e.shiftKey)) {
                if (ref.current && document.body.contains(ref.current)) {
                    e.preventDefault();
                    run();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [binding, ref, run]);
}

/** the submit button of a form (`Action::make('save')->submit('save')`): shows the loading state while the request runs */
export function FormSubmitButton({ className, binding, children }: { className: string; binding?: string; children: ReactNode }) {
    const { submitting, submit } = useFormContext();
    const ref = useRef<HTMLButtonElement>(null);
    useBinding(ref, binding, () => submit());
    return (
        <button ref={ref} type="submit" className={className} disabled={submitting}>
            {submitting && <LoadingIndicator />}
            <span style={submitting ? { display: 'none' } : undefined}>{children}</span>
        </button>
    );
}

/** a button that submits the form with extra arguments (`createAnother`) */
export function FormActionButton({ className, binding, args, children }: { className: string; binding?: string; args: Record<string, any>; children: ReactNode }) {
    const { submitting, submit } = useFormContext();
    const ref = useRef<HTMLButtonElement>(null);
    useBinding(ref, binding, () => submit(args));
    return (
        <button ref={ref} type="button" className={className} disabled={submitting} onClick={() => submit(args)}>
            {submitting && <LoadingIndicator />}
            {children}
        </button>
    );
}

/** `document.referrer ? window.history.back() : Livewire.navigate(url)` */
export function FormCancelButton({ className, url, children }: { className: string; url: string; children: ReactNode }) {
    const router = useRouter();
    return (
        <button
            type="button"
            className={className}
            onClick={() => {
                if (document.referrer) window.history.back();
                else router.push(url);
            }}
        >
            {children}
        </button>
    );
}

