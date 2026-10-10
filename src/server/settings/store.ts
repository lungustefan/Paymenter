import { config, replaceSettings, setConfig } from '@/server/config';
import { setAppTimezone } from '@/server/lib/time';
import { flushTranslations } from '@/server/i18n';
import { Setting } from '@/server/models/Setting';
import { cacheForget } from '@/server/cache';
import { settingDefinitionsFlat } from './index';

/**
 * In-process snapshot of the `settings` table - the equivalent of
 * `config('settings')` that `SettingsProvider` fills at boot. It is refreshed
 * at the start of each request (see `ensureSettings`) so changes made by other
 * processes become visible within a few seconds.
 */

const TTL_MS = 5000;

const g = globalThis as unknown as {
    __paymenterSettingsAt?: number;
    __paymenterSettingsPromise?: Promise<void> | null;
};

export async function loadSettings(): Promise<void> {
    const rows = await Setting.query().whereNull('settingable_type').get();
    const values: Record<string, any> = {};
    for (const r of rows) values[r.key] = r.value;
    applySnapshot(values);
    g.__paymenterSettingsAt = Date.now();
}

function applySnapshot(values: Record<string, any>) {
    replaceSettings(values);

    // Config overrides (`override` => `app.name`, `mail.mailers.smtp.host` ...)
    for (const def of settingDefinitionsFlat()) {
        if (def.override && values[def.name] !== undefined && values[def.name] !== null) {
            setConfig(def.override, values[def.name]);
        }
    }
    setAppTimezone(values.timezone ?? config('app.timezone', 'UTC'));
}

/** Load settings if they have not been loaded recently. Safe to call from every entry point. */
export async function ensureSettings(force = false): Promise<void> {
    const fresh = g.__paymenterSettingsAt && Date.now() - g.__paymenterSettingsAt < TTL_MS;
    if (fresh && !force) return;
    if (!g.__paymenterSettingsPromise) {
        g.__paymenterSettingsPromise = loadSettings()
            .catch(() => {
                /* database not migrated yet (install) */
            })
            .finally(() => {
                g.__paymenterSettingsPromise = null;
            });
    }
    await g.__paymenterSettingsPromise;
}

/** Called from Setting's `saved` hook: update the snapshot right away (mirrors the `Saved` event + FlushCacheListener). */
export async function applySavedSetting(setting: Setting): Promise<void> {
    if (setting.settingable_type !== null) return;
    const { allSettings } = await import('@/server/config');
    const next = { ...allSettings(), [setting.key]: setting.value };
    applySnapshot(next);
    // other processes pick the change up on their next refresh
    g.__paymenterSettingsAt = 0;
    await cacheForget('settings');
}

/** SettingsProvider::flushCache() */
export async function flushSettingsCache(): Promise<void> {
    await cacheForget('settings');
    flushTranslations();
    await loadSettings();
}
