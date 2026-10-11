import { setting } from '@/server/config';
import type { SettingDefinition } from '@/server/settings/types';
import * as defaultTheme from '@themes/default/theme';
import { themeRegistry } from '@/generated/registry';

/**
 * Themes. Their definition (`themes/<name>/theme.ts`) is loaded through the
 * generated registry; the default theme is imported statically so settings are
 * always available synchronously.
 */
const loaded: Record<string, { name: string; author: string; url: string; settings: SettingDefinition[] }> = {
    default: defaultTheme as any,
};

export async function loadThemes(): Promise<void> {
    for (const [name, load] of Object.entries(themeRegistry)) {
        if (!loaded[name]) loaded[name] = await load();
    }
}

export function getTheme(name: string) {
    return loaded[name] ?? loaded.default;
}

/** `Theme::getSettings()` - theme settings with the `theme_<name>_` prefix. */
export function themeSettingsFor(themeName: string): SettingDefinition[] {
    const theme = loaded[themeName];
    if (!theme) return [];
    return theme.settings.map((s) => ({ ...s, name: `theme_${themeName}_${s.name}` }));
}

/** `theme('key', default)` helper */
export function themeSetting<T = any>(key: string, fallback: T | null = null): T {
    const current = String(setting('theme', 'default'));
    const v = setting(`theme_${current}_${key}`, undefined as any);
    return (v === undefined || v === null ? fallback : v) as T;
}
