import { ExtensionHelper } from './helper';
import { Extension } from '@/server/models/Extension';
import { cacheForget, cacheRemember } from '@/server/cache';
import { appVersion } from '@/server/version';

/** Extension update statuses (upstream c2ce0a8a / 65301132: `Updates::getInstalledAddons`). */
export type UpdateStatus = 'Builtin' | 'Unknown' | 'Error' | 'Update available' | 'Up to date';

export interface InstalledAddon {
    id: string;
    name: string;
    type: string;
    icon: string | null;
    author: string | null;
    version: string;
    isBuiltin: boolean;
    isUsed: boolean;
    latestVersion: string | null;
    status: UpdateStatus;
    url: string | null;
    marketplaceUrl: string | null;
}

const CACHE_KEY = 'paymenter_marketplace_extension_updates';

const cacheKey = (ids: string[]) => CACHE_KEY + ids.join(',');

/** semver-ish: `1.2.3`, `1.2.3-beta.1`, `1.2.3+build` */
export function isComparableVersion(v: string | null): v is string {
    return v !== null && /^\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

/** `version_compare($a, $b)` for the versions `isComparableVersion` accepts (numeric parts, then pre-release) */
export function compareVersions(a: string, b: string): number {
    const split = (v: string) => {
        const [core, pre] = v.split('+')[0].split(/-(.*)/s);
        return { nums: core.split('.').map(Number), pre: pre ?? null };
    };
    const x = split(a);
    const y = split(b);
    for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
        const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
        if (d) return d < 0 ? -1 : 1;
    }
    if (x.pre === y.pre) return 0;
    if (x.pre === null) return 1;
    if (y.pre === null) return -1;
    return x.pre < y.pre ? -1 : 1;
}

/** Latest versions of the marketplace extensions; an unreachable marketplace yields no updates (statuses become Unknown). */
async function fetchUpdates(ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    try {
        const updates = await cacheRemember(cacheKey(ids), 6 * 3600, async () => {
            const res = await fetch(`https://api.paymenter.org/extensions/updates?extensions=${encodeURIComponent(ids.join(','))}`, {
                signal: AbortSignal.timeout(10000),
                headers: { 'User-Agent': `Paymenter/${appVersion()} (https://paymenter.org)` },
            });
            if (!res.ok) throw new Error(`marketplace answered ${res.status}`); // not cached
            return ((await res.json()) as any)?.updates ?? [];
        });
        return Array.isArray(updates) ? updates : [];
    } catch {
        return [];
    }
}

export function addonStatus(rawVersion: string | null | undefined, installed: string, latest: string | null, hasExtensionId: boolean): UpdateStatus {
    if (rawVersion === 'builtin') return 'Builtin';
    if (!hasExtensionId) return 'Unknown';
    // no data from the marketplace (offline, not listed): unknown instead of an error
    if (latest === null) return 'Unknown';
    if (!isComparableVersion(installed) || !isComparableVersion(latest)) return 'Error';
    return compareVersions(installed, latest) < 0 ? 'Update available' : 'Up to date';
}

export async function getInstalledAddons(): Promise<InstalledAddon[]> {
    const available = await ExtensionHelper.getAvailableExtensions();
    let rows: Extension[] = [];
    try {
        rows = await Extension.all<Extension>();
    } catch {
        /* tables may not exist yet */
    }
    const used = new Set(rows.map((e) => `${e.type}_${e.extension}`.toLowerCase()));

    const hasId = (id: unknown): id is string => !!id && id !== 'unknown';
    const ids = [...new Set(available.map((e) => e.meta?.extensionId).filter(hasId).map(String))];
    const updates = new Map<string, any>();
    for (const u of await fetchUpdates(ids)) if (u?.resource_id !== undefined) updates.set(String(u.resource_id), u);

    return available.map((ext) => {
        const meta = ext.meta;
        const raw = meta?.version ?? null;
        const version = raw === 'builtin' ? appVersion() : !raw ? 'unknown' : raw;
        const extensionId = hasId(meta?.extensionId) ? String(meta!.extensionId) : null;
        const update = extensionId ? updates.get(extensionId) : null;
        const installed = version !== 'unknown' ? version.replace(/^v/, '') : 'unknown';
        const latest = update?.version ? String(update.version).replace(/^v/, '') : null;
        return {
            id: `${ext.type}_${ext.name}`,
            name: meta?.name ?? ext.name,
            type: ext.type.charAt(0).toUpperCase() + ext.type.slice(1),
            icon: meta?.icon || null,
            author: meta?.author || null,
            version: installed,
            isBuiltin: raw === 'builtin',
            isUsed: used.has(`${ext.type}_${ext.name}`.toLowerCase()),
            latestVersion: latest,
            status: addonStatus(raw, installed, latest, extensionId !== null),
            url: meta?.url || null,
            marketplaceUrl: update?.url ?? null,
        };
    });
}

/** "Check for updates" refreshes the extension statuses too */
export async function forgetExtensionUpdates(): Promise<void> {
    const available = await ExtensionHelper.getAvailableExtensions();
    const ids = [...new Set(available.map((e) => e.meta?.extensionId).filter((id): id is string => !!id && id !== 'unknown').map(String))];
    await cacheForget(cacheKey(ids));
}
