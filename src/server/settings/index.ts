import fs from 'node:fs';
import path from 'node:path';
import { availableLanguages } from '@/server/i18n';
import { settingGroupsStatic, themeSelectSetting } from './definitions';
import type { SettingDefinition } from './types';
import { setting } from '@/server/config';
import { themeSettingsFor } from '@/server/themes';

export type { SettingDefinition } from './types';

export function availableThemes(): string[] {
    try {
        return fs
            .readdirSync(path.join(process.cwd(), 'themes'), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
    } catch {
        return ['default'];
    }
}

function dynamic(def: SettingDefinition): SettingDefinition {
    switch (def.dynamic) {
        case 'app_language': {
            const langs = availableLanguages();
            return { ...def, options: langs, validation: `in:${langs.join(',')}` };
        }
        case 'allowed_languages': {
            const langs = availableLanguages();
            return { ...def, options: Object.fromEntries(langs.map((l) => [l, l.toUpperCase()])), default: langs };
        }
        case 'theme': {
            const themes = availableThemes();
            return { ...def, options: themes, validation: `in:${themes.join(',')}` };
        }
    }
    return def;
}

/**
 * `Settings::settings()` - all setting definitions grouped like the admin settings
 * page, including the active theme's own settings in the `theme` group.
 */
export function settingGroups(): Record<string, SettingDefinition[]> {
    const groups: Record<string, SettingDefinition[]> = {};
    for (const [group, defs] of Object.entries(settingGroupsStatic)) groups[group] = defs.map(dynamic);
    groups.theme = [dynamic(themeSelectSetting), ...themeSettingsFor(String(setting('theme', 'default')))];
    return groups;
}

export function settingDefinitionsFlat(): SettingDefinition[] {
    return Object.values(settingGroups()).flat();
}

export function findSettingDefinition(name: string): SettingDefinition | undefined {
    return settingDefinitionsFlat().find((d) => d.name === name);
}
