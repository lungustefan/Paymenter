'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** Hamburger button + full-screen slide over (Alpine `slideOverOpen` + `x-teleport="body"`). */
export function MobileMenu({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        document.documentElement.style.overflow = open ? 'hidden' : '';
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.documentElement.style.overflow = '';
        };
    }, [open]);

    return (
        <>
            <button
                onClick={() => setOpen((o) => !o)}
                className="relative w-10 h-10 flex lg:hidden items-center justify-center rounded-lg hover:bg-neutral transition"
                aria-label="Toggle Menu"
            >
                <span
                    className={cn('absolute inset-0 flex items-center justify-center transition duration-300', open ? 'opacity-0 rotate-90 scale-75 pointer-events-none' : 'opacity-100 rotate-0 scale-100')}
                    aria-hidden="true"
                >
                    <Ri name="menu-fill" className="size-5" />
                </span>
                <span
                    className={cn('absolute inset-0 flex items-center justify-center transition duration-300', open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75 pointer-events-none')}
                    aria-hidden="true"
                >
                    <Ri name="close-fill" className="size-5" />
                </span>
            </button>
            {mounted &&
                open &&
                createPortal(
                    <div className="fixed left-0 right-0 top-16 w-full z-[99]" style={{ height: 'calc(100dvh - 4rem)' }} aria-modal="true" tabIndex={-1}>
                        <div className="absolute inset-0 bg-background-secondary border-t border-neutral shadow-lg overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col h-full p-4" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
                                {children}
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

/** Bottom sheet with the account links (Alpine `userPanelOpen`). */
export function MobileUserPanel({ name, email, avatar, children }: { name: string; email: string; avatar: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    /* eslint-disable @next/next/no-img-element */
    return (
        <div className="relative">
            <button onClick={() => setOpen(true)} aria-label="Open user menu" className="flex gap-4 items-center justify-start">
                <img src={avatar} className="size-10 rounded-full border border-neutral bg-background" alt="avatar" />
                <div className="flex flex-col items-start gap-0.5">
                    <span className="font-bold text-md">{name}</span>
                    <span className="text-sm text-base/70">{email}</span>
                </div>
            </button>

            {open && (
                <>
                    <div onClick={() => setOpen(false)} className="fixed inset-0 bg-primary/5 backdrop-blur-xs z-40" style={{ pointerEvents: 'auto' }}></div>
                    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full" style={{ pointerEvents: 'auto' }} tabIndex={-1} aria-modal="true" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
                        <div className="bg-background-secondary shadow-lg rounded-t-2xl border border-neutral p-6">
                            <div className="flex gap-4 items-center justify-start">
                                <img src={avatar} className="size-12 rounded-full border border-neutral bg-background" alt="avatar" />
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-lg">{name}</span>
                                    <span className="text-sm text-base/70">{email}</span>
                                </div>
                            </div>
                            <div className="h-px w-full bg-neutral my-6"></div>
                            <div className="mt-4 flex flex-col gap-2 w-full">{children}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
