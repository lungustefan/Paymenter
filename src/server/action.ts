import { unstable_rethrow } from 'next/navigation';
import { DisplayException } from './exceptions';
import { ValidationError } from './validation';
import { cookies } from 'next/headers';

/**
 * Result of a server action - the equivalent of what a Livewire request sends back
 * (validation errors for `@error`, `$this->notify()` toasts, redirects).
 */
export interface ActionResult<T = unknown> {
    ok: boolean;
    errors?: Record<string, string[]>;
    notify?: { message: string; type: 'success' | 'error' | string };
    redirect?: string;
    /** leave the single-page navigation (admin panel, external URLs) */
    hard?: boolean;
    data?: T;
}

/** Wrap an action body: DisplayException => error toast, ValidationError => field errors. */
export async function action<T = unknown>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
    try {
        const result = await fn();
        return result ?? { ok: true };
    } catch (e) {
        unstable_rethrow(e);
        if (e instanceof DisplayException) return { ok: false, notify: { message: e.message, type: 'error' } };
        if (e instanceof ValidationError) return { ok: false, errors: e.errors };
        console.error('[action]', e);
        throw e;
    }
}

export const ok = <T>(data?: T, notify?: ActionResult['notify']): ActionResult<T> => ({ ok: true, data, notify });
export const notifySuccess = (message: string): ActionResult => ({ ok: true, notify: { message, type: 'success' } });
export const notifyError = (message: string): ActionResult => ({ ok: false, notify: { message, type: 'error' } });

export const FLASH_COOKIE = 'paymenter_flash';

/** `$this->notify($message, $type, redirect: true)`: shown on the next page (`Session::put('notification')`). */
export async function flash(message: string, type: 'success' | 'error' = 'success'): Promise<void> {
    (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ id: Date.now() + Math.floor(Math.random() * 1000), message, type })), {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 60,
    });
}

export async function readFlash(): Promise<{ id: number; message: string; type: string } | null> {
    try {
        const raw = (await cookies()).get(FLASH_COOKIE)?.value;
        return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch {
        return null;
    }
}
