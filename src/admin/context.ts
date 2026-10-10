import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { User } from '@/server/models/User';
import { registerLangNamespace, type Translator } from '@/server/i18n';

/** The Filament language packs (`vendor/filament/*\/resources/lang`), converted to `lang/vendor/<namespace>/<locale>/*.json`. */
const FILAMENT_NAMESPACES = ['filament', 'filament-actions', 'filament-forms', 'filament-infolists', 'filament-notifications', 'filament-panels', 'filament-query-builder', 'filament-schemas', 'filament-tables', 'filament-widgets'];

let registered = false;
export function registerFilamentLang() {
    if (registered) return;
    registered = true;
    for (const ns of FILAMENT_NAMESPACES) registerLangNamespace(ns, path.join(process.cwd(), 'lang', 'vendor', ns));
}

/**
 * Everything an admin page / action needs while it is rendered or handled. The Livewire component
 * keeps this on `$this`; here it lives in an AsyncLocalStorage, so every `async` render method of the
 * admin framework can reach the current user, the translator and the page URL.
 */
export interface AdminContext {
    user: User;
    locale: string;
    tr: Translator;
    /** `/admin/currencies/1/edit` */
    pathname: string;
    searchParams: Record<string, string | string[] | undefined>;
    /** a table already rendered the container of the action modals (`hasActionsModalRendered`) */
    modalsPlaced?: boolean;
}

const store = new AsyncLocalStorage<AdminContext>();

export function runAdmin<T>(ctx: AdminContext, fn: () => Promise<T>): Promise<T> {
    registerFilamentLang();
    return store.run(ctx, fn);
}

export function adminContext(): AdminContext {
    const ctx = store.getStore();
    if (!ctx) throw new Error('The admin context is only available while rendering or handling an admin request.');
    return ctx;
}

export const currentAdminUser = () => adminContext().user;

/** `__('filament-actions::edit.single.label')` in the locale of the current admin request */
export function trans(key: string, replace: Record<string, unknown> = {}): string {
    const ctx = store.getStore();
    if (!ctx) return key;
    return ctx.tr.t(key, replace);
}

/** `trans_choice()` */
export function transChoice(key: string, count: number | unknown[], replace: Record<string, unknown> = {}): string {
    const ctx = store.getStore();
    if (!ctx) return key;
    return ctx.tr.tChoice(key, count, replace);
}
