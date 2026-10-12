import notificationTemplates from '@/server/data/notification-templates.json';
import countries from '@/server/data/countries.json';
import fs from 'node:fs';
import path from 'node:path';
import { currentDb } from '@/server/orm';
import { notificationTemplates as notificationTemplatesTable, customProperties } from './schema';
import { settingGroupsStatic } from '@/server/settings/definitions';
import { settingGroups } from '@/server/settings';
import { Currency } from '@/server/models/Currency';
import { Role } from '@/server/models/Role';
import { Setting } from '@/server/models/Setting';
import { flushSettingsCache } from '@/server/settings/store';
import { sql } from 'drizzle-orm';
import { Carbon } from '@/server/lib/carbon';

/** Port of Database\Seeders\DatabaseSeeder + EmailTemplateSeeder. */

const DATA = path.join(process.cwd(), 'src', 'server', 'data');

export async function seed(log: (msg: string) => void = () => {}) {
    log('\n  INFO  Seeding database.\n');

    await Role.updateOrCreate({ name: 'admin' }, { permissions: ['*'] });

    for (const defs of Object.values(settingGroups())) {
        for (const def of defs) {
            if (def.default === undefined || def.default === null) continue;
            let value: any = def.default;
            if (['mail_header', 'mail_footer', 'mail_css'].includes(def.name)) {
                value = fs.readFileSync(path.join(DATA, def.name), 'utf8');
            }
            await Setting.firstOrCreate({ key: def.name }, { value, type: def.database_type ?? 'string' });
        }
    }
    void settingGroupsStatic;

    // Seed default currency (USD)
    if ((await Currency.count()) === 0) {
        await Currency.create({ code: 'USD', name: 'US Dollar', prefix: '$', suffix: '', format: '1,000.00' });
    }

    await flushSettingsCache();

    await seedNotificationTemplates();
    log('  Database\\Seeders\\EmailTemplateSeeder ............................. DONE');
}

/** insertOrIgnore of every notification template */
export async function seedNotificationTemplates() {
    const now = Carbon.now();
    for (const [key, data] of Object.entries(notificationTemplates as Record<string, Record<string, any>>)) {
        await currentDb()
            .insert(notificationTemplatesTable)
            .ignore()
            .values({ ...data, key, enabled: true, created_at: now, updated_at: now } as any);
    }
}

/** Port of Database\Seeders\CustomPropertySeeder (the standard user profile fields). */
export async function seedCustomProperties() {
    const base = { model: 'App\\Models\\User', non_editable: false, validation: 'string|max:255' };
    const rows = [
        { key: 'phone', name: 'Phone', type: 'string', required: true, show_on_invoice: false },
        { key: 'company_name', name: 'Company Name', type: 'string', required: false, show_on_invoice: true },
        { key: 'address', name: 'Address', type: 'string', required: true, show_on_invoice: true },
        { key: 'address2', name: 'Address 2', type: 'string', required: false, show_on_invoice: false },
        { key: 'city', name: 'City', type: 'string', required: true, show_on_invoice: true },
        { key: 'state', name: 'State', type: 'string', required: true, show_on_invoice: true },
        { key: 'zip', name: 'ZIP', type: 'string', required: true, show_on_invoice: true },
    ].map((r) => ({ ...base, ...r }));
    await currentDb().insert(customProperties).ignore().values(rows as any);
    await currentDb()
        .insert(customProperties)
        .ignore()
        .values({
            ...base,
            key: 'country',
            name: 'Country',
            type: 'select',
            required: true,
            show_on_invoice: true,
            allowed_values: Object.values(countries as Record<string, string>).slice(1),
        } as any);
    void sql;
}
