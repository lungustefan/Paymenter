import { Setting } from '@/server/models/Setting';
import { setting as configSetting } from '@/server/config';
import { Settings as SettingsClass } from '@/server/classes/Settings';
import type { User } from '@/server/models/User';
import { FormPage } from './FormPage';
import { Schema, Tab, Tabs } from '../forms';
import { convertInput } from '../forms/convert';
import { Notification } from '../Notification';
import { hasPermission } from '@/server/policies';

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ucwords = (s: string) => s.replace(/(^|[\s\-_])([a-z])/g, (_m, p, c) => p + c.toUpperCase());

/** App\Admin\Pages\Settings */
export class Settings extends FormPage {
    static slug = 'settings';
    static title = 'Settings';
    static navigationGroup = 'System';
    static navigationIcon = 'ri-settings-3-line';
    static activeNavigationIcon = 'ri-settings-3-fill';

    static override canAccess(user: User | null) {
        return !!user && hasPermission(user, 'admin.settings.view');
    }

    protected fillData() {
        const values: Record<string, any> = {};
        for (const settings of Object.values(SettingsClass.settings())) for (const s of settings) values[s.name] = configSetting(s.name, (s as any).default ?? null);
        return values;
    }

    protected makeSchema() {
        const tabs = Object.entries(SettingsClass.settings()).map(([key, settings]) =>
            Tab.make(key)
                .label(ucwords(key.replace(/-/g, ' ')))
                .schema(() => settings.map((s) => convertInput(s))),
        );
        return Schema.make().components([Tabs.make('Tabs').tabs(tabs).persistTabInQueryString()]);
    }

    protected override async renderSchema(schema: Schema, rc: any) {
        const [tabs] = schema.getComponents() as any[];
        return tabs.render(rc);
    }

    protected async save(data: Record<string, any>) {
        if (!(await hasPermission(this.user, 'admin.settings.update'))) throw new Error('This action is unauthorized.');
        const existing = new Map((await Setting.query().whereNull('settingable_type').whereIn('key', Object.keys(data)).get()).map((s: any) => [s.key, s]));
        const definitions = Object.values(SettingsClass.settings()).flat() as any[];
        for (const [key, value] of Object.entries(data)) {
            const def = definitions.find((d) => d.name === key) ?? {};
            const current = existing.get(key) as any;
            const stored = current?.value ?? def.default ?? null;
            const type = def.database_type ?? 'string';
            if (!deepEqual(value, stored) || (type === 'boolean' && !!value !== !!stored)) {
                if (current) await current.update({ value, type, encrypted: def.encrypted ?? false });
                else await Setting.create({ key, value, settingable_type: null, type, encrypted: def.encrypted ?? false });
            }
        }
        await Notification.make().title('Saved successfully!').success().send();
    }
}
