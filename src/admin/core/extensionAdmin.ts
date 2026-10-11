import { registerExtensionAdmin, forgetExtensionAdmin } from './registry';
import { adminRegistry } from '@/generated/registry';
import { Extension } from '@/server/models/Extension';

const g = globalThis as unknown as { __paymenterAdminSyncAt?: number };
const TTL_MS = 3000;

/**
 * `AdminPanelProvider`: the resources / pages of the extensions that are enabled (servers and gateways
 * always) belong to the panel; the ones of disabled extensions are left out.
 */
export async function syncExtensionAdmin(force = false): Promise<void> {
    if (!force && g.__paymenterAdminSyncAt && Date.now() - g.__paymenterAdminSyncAt < TTL_MS) return;
    g.__paymenterAdminSyncAt = Date.now();
    let active = new Set<string>();
    try {
        const rows = await Extension.query()
            .where((q: any) => q.where('enabled', true).orWhere('type', 'server').orWhere('type', 'gateway'))
            .get();
        active = new Set(rows.map((r: any) => String(r.extension)));
    } catch {
        // not migrated yet
    }
    for (const entry of adminRegistry) {
        if (!active.has(entry.name)) {
            forgetExtensionAdmin(entry.name);
            continue;
        }
        const mod = await entry.load();
        registerExtensionAdmin(entry.name, typeof mod.default === 'function' ? mod.default() : mod.default);
    }
}
