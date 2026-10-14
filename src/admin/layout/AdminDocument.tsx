import type { ReactNode } from 'react';
import { statSync } from 'node:fs';
import path from 'node:path';
import { setting, config } from '@/server/config';
import { storageUrl } from '@/server/routes';
import { activeThemeName } from '@/server/theme-module';
import { isRtl } from '@/server/locales';
import { Head } from '@themes/default/layouts/Head';
import { filamentPalette } from './palette';
import { NotificationsHost, ThemeSync } from './client';
import { ActionsProvider } from '../actions/client';
import type { NotificationData } from '../Notification';

/** cache-buster for the un-hashed admin stylesheet, so a browser can never pair new HTML with a stale cached admin.css */
const cssVersion = (theme: string) => {
    try {
        return Math.floor(statSync(path.join(process.cwd(), 'public/build/themes', theme, 'admin.css')).mtimeMs).toString(36);
    } catch {
        return '0';
    }
};

const darkModeScript = `const loadDarkMode = () => {
    window.theme = localStorage.getItem('theme') ?? 'system'
    if (
        window.theme === 'dark' ||
        (window.theme === 'system' &&
            window.matchMedia('(prefers-color-scheme: dark)')
                .matches)
    ) {
        document.documentElement.classList.add('dark')
    }
}

loadDarkMode()`;

/** The `<html>` of the admin panel (Filament's `layout.base`), used instead of the client area one for /admin. */
export function AdminDocument({ locale, flashed, children }: { locale: string; flashed: NotificationData[]; children: ReactNode }) {
    const favicon = setting<string | null>('favicon');
    return (
        <html lang={locale.replace('_', '-')} dir={isRtl(locale) ? 'rtl' : 'ltr'} className="fi" suppressHydrationWarning>
            <head>
                <title>{config('app.name', 'Paymenter')}</title>
                {favicon ? <link rel="icon" href={storageUrl(favicon)} /> : null}
                <style dangerouslySetInnerHTML={{ __html: filamentPalette }} />
                <style
                    dangerouslySetInnerHTML={{
                        __html: `:root {
    --font-family: 'Inter Variable';
    --mono-font-family: 'ui-monospace';
    --serif-font-family: 'ui-serif';
    --sidebar-width: 20rem;
    --collapsed-sidebar-width: 4.5rem;
    --default-theme-mode: system;
}

html.fi {
    --livewire-progress-bar-color: var(--primary-500);
}`,
                    }}
                />
                <link href="/fonts/filament/filament/inter/index.css" rel="stylesheet" />
                <link rel="stylesheet" href={`/build/themes/${activeThemeName()}/admin.css?v=${cssVersion(activeThemeName())}`} precedence="default" />
                <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
                <Head />
            </head>
            <body className="fi-body fi-panel-admin fi-body-has-navigation fi-body-has-topbar" suppressHydrationWarning>
                <ThemeSync />
                <NotificationsHost initial={flashed} closeLabel="Close">
                    <ActionsProvider>{children}</ActionsProvider>
                </NotificationsHost>
            </body>
        </html>
    );
}
