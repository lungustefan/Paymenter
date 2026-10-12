'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';
import { useFormStatus } from 'react-dom';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode; pending?: boolean };

/** Loading state for `type="submit"` buttons (`wire:loading`): spinner replaces the label while submitting. */
function Content({ type, pending, children }: { type?: string; pending?: boolean; children?: ReactNode }) {
    const status = useFormStatus();
    const loading = pending ?? status.pending;
    if (type !== 'submit') return <>{children}</>;
    return (
        <>
            {loading && (
                <div role="status">
                    <Ri name="loader-5-fill" aria-hidden="true" className="size-6 me-2 fill-background animate-spin" />
                    <span className="sr-only">Loading...</span>
                </div>
            )}
            {!loading && <div>{children}</div>}
        </>
    );
}

export function PrimaryButton({ className, children, pending, ...rest }: Props) {
    return (
        <button
            {...rest}
            className={cn(
                'flex items-center gap-2 justify-center bg-primary text-white text-sm font-semibold hover:bg-primary/80 py-2.5 lg:py-2 px-4.5 rounded-md w-full duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        >
            <Content type={rest.type} pending={pending}>
                {children}
            </Content>
        </button>
    );
}

export function SecondaryButton({ className, children, pending, ...rest }: Props) {
    return (
        <button
            {...rest}
            className={cn(
                'flex items-center gap-2 justify-center bg-background-secondary text-sm font-semibold border border-neutral hover:bg-background-secondary/80 py-2.5 lg:py-2 px-4.5 rounded-md w-full duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        >
            <Content type={rest.type} pending={pending}>
                {children}
            </Content>
        </button>
    );
}

export function DangerButton({ className, children, ...rest }: Props) {
    return (
        <PrimaryButton {...rest} className={cn('bg-red-700 bg-none text-white py-2 px-4 rounded hover:bg-red-600', className)}>
            {children}
        </PrimaryButton>
    );
}

export { PrimaryButton as Button };
