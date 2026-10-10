import { loadEnv } from './env';
import { ensureSettings } from './settings/store';
import { registerListeners } from './listeners';
import './models';
import './jobs/server';
import './auth/session';
import { ExtensionHelper } from './extensions/helper';
import { loadThemes } from './themes';

/**
 * Application boot - what Laravel's service providers do once per process:
 * load settings, register listeners and jobs, boot enabled extensions.
 */
/**
 * Registries (event listeners, named routes, extension routes, jobs) are module state, and Next.js can
 * load the same module more than once (instrumentation, route handlers and server actions are separate
 * bundles), so every module instance boots itself the first time it is used.
 */
let booted: Promise<void> | null = null;

export function boot(): Promise<void> {
    if (!booted) {
        booted = (async () => {
            loadEnv();
            await loadThemes();
            await ensureSettings(true);
            registerListeners();
            try {
                await ExtensionHelper.bootExtensions();
            } catch {
                /* tables may not exist before the first migration */
            }
        })().catch((e) => {
            booted = null;
            throw e;
        });
    }
    return booted;
}

export { ensureSettings };
