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
const g = globalThis as unknown as { __paymenterBooted?: Promise<void> };

export function boot(): Promise<void> {
    if (!g.__paymenterBooted) {
        g.__paymenterBooted = (async () => {
            loadEnv();
            await loadThemes();
            await ensureSettings(true);
            registerListeners();
            try {
                await ExtensionHelper.bootExtensions();
            } catch {
                /* tables may not exist before the first migration */
            }
        })();
    }
    return g.__paymenterBooted;
}

export { ensureSettings };
