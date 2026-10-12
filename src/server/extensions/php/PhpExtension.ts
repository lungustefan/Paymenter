import { Extension } from '../Extension';
import { Gateway } from '../Gateway';
import { Server } from '../Server';
import { listen } from '@/server/events';
import { registerRoute } from '@/server/routes';
import { ExtensionHelper } from '../helper';
import type { ExtensionRoute } from '../types';
import { PhpBridgeError } from './bridge';
import { getPhpBridge } from './runtime';
import { marshal } from './marshal';
import type { PhpExtensionInfo } from './discovery';

export interface PhpDescription {
    meta: { name?: string; description?: string; version?: string; author?: string; url?: string; icon?: string } | null;
    methods: string[];
    class: string;
}

const LIFECYCLE_BASE = new Set(['config', 'boot']);
const listening = new Set<string>();
/** JSON of the config each extension was last booted with */
const bootedConfig = new Map<string, string>();

async function isEnabled(name: string): Promise<boolean> {
    const { Extension: ExtensionModel } = await import('@/server/models/Extension');
    return !!(await ExtensionModel.query().where('extension', name).where('enabled', true).first());
}

/** `{__unsupported: 'view'}` and friends come back as data; turn them into errors the admin can read */
function unwrap(name: string, value: any) {
    if (value && typeof value === 'object' && value.__unsupported === 'view') {
        throw new PhpBridgeError(`PHP extension ${name} returned the Blade view "${value.name}". Blade views cannot be rendered by the Node.js panel; return a redirect URL or HTML instead (see docs/php-extensions.md).`, 'unsupported');
    }
    return value;
}

/** An Error that keeps the PHP exception message, which is what the PHP panel showed to the admin. */
function asError(e: unknown): Error {
    if (e instanceof PhpBridgeError) {
        if (e.kind === 'unsupported') return new PhpBridgeError(`${e.message} (the PHP extension uses a Laravel feature the compatibility shim does not provide; see docs/php-extensions.md)`, 'unsupported', e.status, e.phpClass);
        return e;
    }
    return e as Error;
}

/**
 * Build a TypeScript extension class that forwards every public method of an upstream-layout PHP extension
 * to the bridge. The class is created at runtime, so no rebuild is needed to add or update a PHP extension.
 */
export function createPhpExtensionClass(info: PhpExtensionInfo, desc: PhpDescription): new (config?: Record<string, any>) => Extension {
    const Base: any = info.type === 'gateway' ? Gateway : info.type === 'server' ? Server : Extension;
    const bridge = () => getPhpBridge();
    const target = { type: info.type, name: info.name };

    class PhpExtension extends Base {
        static meta = desc.meta
            ? { name: desc.meta.name || info.name, description: desc.meta.description || '', version: desc.meta.version || '', author: desc.meta.author || '', url: desc.meta.url || undefined, icon: desc.meta.icon || undefined }
            : { name: info.name, description: '', version: '', author: '', url: undefined, icon: undefined };
        static runtime = 'php';
        static phpWarnings = info.warnings;

        private phpRoutes: ExtensionRoute[] = [];

        async __phpCall(fn: string, args: any[]) {
            try {
                return unwrap(info.name, await bridge().call('call', { ...target, config: this.configValues, fn, args: await marshal(args) }));
            } catch (e) {
                throw asError(e);
            }
        }

        async boot() {
            const res = await bridge().boot({ ...target, config: this.configValues });
            bootedConfig.set(info.name, JSON.stringify(this.configValues));
            this.phpRoutes = [];
            for (const r of res.routes as any[]) {
                if (r.name) registerRoute(r.name, r.path);
                for (const method of r.methods as string[]) {
                    this.phpRoutes.push({
                        name: r.name ?? undefined,
                        method: method as ExtensionRoute['method'],
                        path: r.path,
                        auth: !!r.auth,
                        where: Array.isArray(r.where) ? undefined : r.where,
                        handler: async (ctx) => {
                            const url = new URL(ctx.request.url);
                            const headers: Record<string, string> = {};
                            ctx.request.headers.forEach((v, k) => (headers[k] = v));
                            const query: Record<string, string> = {};
                            url.searchParams.forEach((v, k) => (query[k] = v));
                            let out: any;
                            // like the container-resolved controller: the settings as they are saved now
                            const config = ((await ctx.instance<any>().catch(() => this)) ?? this).configValues;
                            try {
                                out = await bridge().call('route', {
                                    ...target,
                                    key: r.key,
                                    config,
                                    request: { method: ctx.request.method, url: ctx.request.url, headers, query, body: await ctx.text().catch(() => ''), all: await ctx.all(), ip: ctx.ip, params: ctx.params },
                                });
                            } catch (e) {
                                if (e instanceof PhpBridgeError && e.kind === 'http') return new Response(e.message || 'Error', { status: e.status ?? 500 });
                                throw asError(e);
                            }
                            const status = Number(out.status) || 200;
                            const body = [204, 205, 304].includes(status) ? null : String(out.body ?? '');
                            return new Response(body, { status, headers: out.headers ?? {} });
                        },
                    });
                }
            }
            // Event::listen() inside boot(): forward the panel's events to the PHP listeners (once per extension + event)
            for (const event of res.events as string[]) {
                const key = `${info.name}:${event}`;
                if (listening.has(key)) continue;
                listening.add(key);
                listen(event, async (payload: any) => {
                    try {
                        // listeners are closures bound to the config of the last boot(): re-boot when the saved settings changed
                        let current: any;
                        try {
                            current = await ExtensionHelper.freshInstance(info.type, info.name);
                        } catch {
                            return; // not installed
                        }
                        if (info.type === 'other' && !(await isEnabled(info.name))) return;
                        if (JSON.stringify(current.configValues) !== bootedConfig.get(info.name)) await current.boot();
                        await bridge().call('event', { ...target, event, payload: await marshal(payload) });
                    } catch (e: any) {
                        console.error(`[extension:${info.name}] listener for ${event} failed: ${e?.message ?? e}`);
                    }
                });
            }
        }

        routes() {
            return this.phpRoutes;
        }
    }

    for (const fn of desc.methods) {
        if (LIFECYCLE_BASE.has(fn)) continue;
        Object.defineProperty(PhpExtension.prototype, fn, {
            configurable: true,
            writable: true,
            value: function (this: any, ...args: any[]) {
                return this.__phpCall(fn, args);
            },
        });
    }
    return PhpExtension as any;
}
