'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition, type ChangeEvent } from 'react';
import type { ActionResult } from '@/server/action';
import { useNotify } from './Providers';

type Errors = Record<string, string[]>;

/**
 * Client side counterpart of a Livewire component's state: `wire:model` values,
 * `@error` messages and `wire:loading`. Server actions return an `ActionResult`
 * (field errors, toast, redirect) and this hook applies it.
 */
export function useForm<T extends Record<string, any>>(initial: T) {
    const router = useRouter();
    const notify = useNotify();
    const [data, setData] = useState<T>(initial);
    const [errors, setErrors] = useState<Errors>({});
    const [pending, startTransition] = useTransition();

    const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
        setData((d) => ({ ...d, [key]: value }));
    }, []);

    /** `wire:model="name"` for text-like inputs */
    const bind = (name: keyof T & string) => ({
        name,
        value: (data[name] ?? '') as any,
        onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(name, e.target.value as any),
        error: errors[name],
    });

    /** `wire:model="name"` for checkboxes */
    const bindChecked = (name: keyof T & string) => ({
        name,
        checked: !!data[name],
        onChange: (e: ChangeEvent<HTMLInputElement>) => set(name, e.target.checked as any),
        error: errors[name],
    });

    const error = (name: string): string[] | undefined => errors[name];

    const apply = useCallback(
        (result: ActionResult<any>) => {
            setErrors(result.errors ?? {});
            if (result.notify) notify(result.notify.message, result.notify.type);
            if (result.redirect) {
                if (result.redirect === 'refresh') router.refresh();
                else if (result.hard) window.location.href = result.redirect;
                else router.push(result.redirect);
            }
            return result;
        },
        [notify, router],
    );

    /** Call a server action; `onDone` runs with the result afterwards. */
    const run = useCallback(
        (fn: () => Promise<ActionResult<any>>, onDone?: (result: ActionResult<any>) => void) => {
            startTransition(async () => {
                const result = apply(await fn());
                onDone?.(result);
            });
        },
        [apply],
    );

    const reset = useCallback((...keys: (keyof T)[]) => {
        setData((d) => {
            const next = { ...d };
            for (const k of keys.length ? keys : (Object.keys(initial) as (keyof T)[])) next[k] = initial[k];
            return next;
        });
    }, [initial]);

    return { data, setData, set, bind, bindChecked, errors, setErrors, error, pending, run, apply, reset, startTransition };
}
