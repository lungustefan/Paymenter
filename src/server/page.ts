import { notFound, redirect } from 'next/navigation';
import { boot } from './bootstrap';
import { ensureSettings } from './settings/store';
import { config, setting } from './config';
import { makeTranslator, allowedLanguages, availableLanguages, type Translator } from './i18n';
import { sessionGet } from './session';
import { getCurrentUser, getAuthUser, isImpersonating, validateSessionLock, logout } from './auth/session';
import { route } from './routes';
import { once } from './request-store';
import { currentPath, currentSearch } from './request';
import { getCookie } from './cookies';
import type { User } from './models/User';

/**
 * Per-request page plumbing - what the `web` middleware group, the `auth`,
 * `guest` and `verified` middleware and the Livewire `Component` base class do
 * in the PHP release.
 */

export interface PageContext {
    locale: string;
    tr: Translator;
    t: Translator['t'];
    user: User | null;
}

/** Boot the app (once per process), refresh settings and resolve locale + user. */
export function initRequest(): Promise<PageContext> {
    return once('page:ctx', async () => {
        await boot();
        await ensureSettings();
        const locale = await getLocale();
        const tr = makeTranslator(locale);
        let user = await getCurrentUser();

        // `LockSession` middleware
        const real = await getAuthUser();
        if (real && !(await validateSessionLock(real))) {
            await logout();
            user = null;
            redirect('/');
        }
        return { locale, tr, t: tr.t, user };
    });
}

export async function getLocale(): Promise<string> {
    const fromSession = await sessionGet<string | null>('locale', null);
    const locale = fromSession ?? config<string>('app.locale', 'en');
    return availableLanguages().includes(locale) ? locale : config<string>('app.fallback_locale', 'en');
}

/** `abort(404)` */
export function abort404(): never {
    notFound();
}

/** `Route::middleware('auth')` - guests are sent to the login page. */
export async function requireUser(options: { verified?: boolean } = {}): Promise<User> {
    const { user } = await initRequest();
    if (!user) {
        // remember where the guest wanted to go (`url.intended`)
        const path = await currentPath();
        const search = await currentSearch();
        redirect(`/auth/guest?to=${encodeURIComponent(path + search)}`);
    }
    // MustVerfiyEmail middleware (only on the dashboard / services / invoices / tickets routes)
    if (options.verified && setting('mail_must_verify') && !user.hasVerifiedEmail()) {
        redirect(route('verification.notice', {}, false));
    }
    return user;
}

/** `Route::middleware('guest')` - signed in users are sent to the dashboard. */
export async function requireGuest(): Promise<void> {
    const { user } = await initRequest();
    if (user) redirect(route('dashboard', {}, false));
}

/** Disabled-if attribute: 404 when the setting matches. */
export async function disabledIf(settingKey: string, defaultValue: unknown = false, reverse = false): Promise<void> {
    let condition = !!setting(settingKey, defaultValue);
    if (reverse) condition = !condition;
    if (condition) notFound();
}

/**
 * `checkout` middleware: `?currency=` and `?coupon=` need session / cookie writes, which a rendering
 * page cannot do, so the request is redirected through `/checkout-parameters` and comes back clean.
 */
export async function handleCheckoutParameters(searchParams: Record<string, string | string[] | undefined>): Promise<void> {
    const pick = (k: string) => (typeof searchParams[k] === 'string' ? (searchParams[k] as string) : Array.isArray(searchParams[k]) ? (searchParams[k] as string[])[0] : undefined);
    const currency = pick('currency');
    const coupon = pick('coupon');
    if (currency === undefined && coupon === undefined) return;
    const rest = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
        if (k === 'currency' || k === 'coupon' || v === undefined) continue;
        for (const item of Array.isArray(v) ? v : [v]) rest.append(k, item);
    }
    const path = await currentPath();
    const to = path + (rest.toString() ? `?${rest.toString()}` : '');
    const q = new URLSearchParams({ to });
    if (currency !== undefined) q.set('currency', currency);
    if (coupon !== undefined) q.set('coupon', coupon);
    redirect(`/checkout-parameters?${q.toString()}`);
}

export { allowedLanguages, isImpersonating, getCookie };
