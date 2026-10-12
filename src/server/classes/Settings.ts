import crypto from 'node:crypto';
import { setting } from '@/server/config';
import { once } from '@/server/request-store';
import { findSettingDefinition, settingGroups } from '@/server/settings';
import countries from '@/server/data/countries.json';
import { Setting } from '@/server/models/Setting';
import { TaxRate } from '@/server/models/TaxRate';
import type { User } from '@/server/models/User';

export class Settings {
    static settings = settingGroups;

    /**
     * Tax rate for a user: their country's rate, else the catch-all `all` rate.
     * Memoised per request and user (Laravel's `once()` including closure vars).
     */
    static async tax(user?: User | null): Promise<TaxRate | null> {
        const u = user ?? (await currentUser());
        return once(`tax:${u?.id ?? 'guest'}`, async () => {
            const properties = u ? await u.rel('properties') : [];
            let country: string | null = properties.find((p) => p.key === 'country')?.value ?? null;

            // Change country to a two-letter country code if it's not already
            if (country) {
                const code = Object.entries(countries as Record<string, string>).find(([, name]) => name === country)?.[0];
                country = code || country;
            }

            const rates = await TaxRate.query().whereIn('country', [country ?? '', 'all']).get();
            // prefer the user's own country over "all"
            const match = rates.sort((a, b) => Number(b.country === country) - Number(a.country === country))[0];
            return match ?? null;
        });
    }

    /** `Settings::getSetting($key)` - the definition plus the stored value. */
    static async getSetting(key: string) {
        const def = findSettingDefinition(key);
        const row = await Setting.query().whereNull('settingable_type').where('key', key).first();
        return { ...(def ?? { name: key }), value: row ? row.value : (def?.default ?? null) };
    }

    /** Stable per-installation UUID plus the daily time at which telemetry is sent. */
    static async getTelemetry() {
        let uuid: string | null = null;
        try {
            uuid = (await Setting.query().where('key', 'telemetry_uuid').first())?.value ?? null;
        } catch {
            uuid = null;
        }
        if (!uuid) {
            uuid = crypto.randomUUID();
            try {
                await Setting.updateOrCreate({ key: 'telemetry_uuid' }, { value: uuid });
            } catch {
                /* avoid errors in workflows */
            }
        }
        // Daily fixed time based on UUID
        const time = Number.parseInt(uuid.slice(27).replace(/-/g, ''), 16) % 1440;
        return { uuid, hour: Math.floor(time / 60), minute: time % 60 };
    }

    static async validateOrCreateVapidKeys(): Promise<boolean> {
        const publicKey = setting<string>('vapid_public_key');
        const privateKey = setting<string>('vapid_private_key');
        if (publicKey && privateKey && publicKey.length > 80 && privateKey.length > 40) return true;
        try {
            const webpush = (await import('web-push')).default;
            const keys = webpush.generateVAPIDKeys();
            await Setting.updateOrCreate({ key: 'vapid_public_key', encrypted: true }, { value: keys.publicKey });
            await Setting.updateOrCreate({ key: 'vapid_private_key', encrypted: true }, { value: keys.privateKey });
            return true;
        } catch {
            return false;
        }
    }
}

async function currentUser(): Promise<User | null> {
    try {
        const { getCurrentUser } = await import('@/server/auth/session');
        return await getCurrentUser();
    } catch {
        return null;
    }
}
