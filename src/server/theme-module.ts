import type { ComponentType, ReactNode } from 'react';
import { setting } from './config';
import { themeModuleRegistry } from '@/generated/registry';

/**
 * A theme (`themes/<name>/index.ts`) provides the page chrome and the views for
 * every page. Page routes fetch their data and render `await view('name')`, so a
 * theme can restyle the whole client area without touching the logic.
 */
export interface ThemeModule {
    name: string;
    author: string;
    url: string;
    settings: any[];
    /** extra tags for <head> (colour variables ...) */
    Head: ComponentType<{}>;
    /** page frame: navigation, sidebar, footer */
    AppLayout: ComponentType<{ title?: string; sidebar?: boolean; children?: ReactNode }>;
    views: Record<string, () => Promise<{ default: ComponentType<any> }>>;
}

async function loadModule(name: string): Promise<ThemeModule | null> {
    const loader = themeModuleRegistry[name];
    if (!loader) return null;
    // dynamic import() is cached by the runtime; no extra cache here so HMR keeps working in development
    return (await loader()) as ThemeModule;
}

export function activeThemeName(): string {
    const configured = String(setting('theme', 'default'));
    return themeModuleRegistry[configured] ? configured : 'default';
}

export async function activeTheme(): Promise<ThemeModule> {
    return (await loadModule(activeThemeName()))!;
}

/** Resolve a view of the active theme, falling back to the default theme's. */
export async function themeView<P = any>(name: string): Promise<ComponentType<P>> {
    const active = await activeTheme();
    const loader = active.views[name] ?? (await loadModule('default'))?.views[name];
    if (!loader) throw new Error(`View [${name}] not found.`);
    return (await loader()).default as ComponentType<P>;
}
