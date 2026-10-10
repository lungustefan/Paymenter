'use server';

import type { AdminActionResult, AdminOp } from './protocol';

/**
 * The single server action of the admin panel: every Livewire-style call (form refresh, submit,
 * mounting / running an action, select search, ...) goes through here with the URL of the page it
 * belongs to.
 */
export async function adminDispatch(url: string, op: AdminOp): Promise<AdminActionResult> {
    const { handleDispatch } = await import('./server/dispatch');
    return handleDispatch(url, op);
}
