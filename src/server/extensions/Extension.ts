import type { ConfigDefinition, ExtensionMeta, ExtensionPage, ExtensionRoute } from './types';
import type { Extension as ExtensionModel } from '@/server/models/Extension';
import type { Endpoint } from '@/server/api/admin';

/**
 * Base class of every extension (port of App\Classes\Extension\Extension).
 * `config(key)` returns the saved settings of this installed extension.
 */
export class Extension {
    static meta?: ExtensionMeta;
    /** views usable from `pay()` / `getView()`: name -> React component module key */
    static views: Record<string, any> = {};

    constructor(public configValues: Record<string, any> = {}) {}

    config<T = any>(key: string): T | null {
        const v = this.configValues[key];
        return (v === undefined ? null : v) as T | null;
    }

    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] | Promise<ConfigDefinition[]> {
        return [];
    }

    /** Called when the extension is installed / enabled */
    installed?(): Promise<void> | void;
    uninstalled?(): Promise<void> | void;
    upgraded?(oldVersion?: string | null): Promise<void> | void;
    /** Called on every boot of an enabled extension: register listeners, routes. */
    boot?(): Promise<void> | void;
    /** Admin enabled / updated the extension row */
    enabled?(extension: ExtensionModel): Promise<void> | void;
    updated?(extension: ExtensionModel): Promise<void> | void;
    testConfig?(): Promise<boolean | string | void> | boolean | string | void;

    /** Routes registered by this extension (webhooks etc.) */
    routes?(): ExtensionRoute[];
    /** Pages of the client area contributed by this extension */
    pages?(): ExtensionPage[];
    /** Resources added to the admin REST API (`/api/v1/admin/<slug>`) */
    apiEndpoints?(): Endpoint[];
}
