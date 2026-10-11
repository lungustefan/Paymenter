import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { initRequest } from '@/server/page';
import { config } from '@/server/config';
import { clientMessages } from '@/server/i18n';
import { availableLocales, isRtl } from '@/server/locales';
import { storageUrl } from '@/server/routes';
import { setting } from '@/server/config';
import { themeSetting } from '@/server/themes';
import { activeTheme, activeThemeName } from '@/server/theme-module';
import { readFlash } from '@/server/action';
import { Hook } from '@/components/Hook';
import { Providers, themeInitScript } from '@themes/default/components/Providers';
import { currentPath } from '@/server/request';
import { AdminDocument } from '@/admin/layout/AdminDocument';
import { consumeFlashedNotifications } from '@/admin/flash';

export async function generateMetadata(): Promise<Metadata> {
    await initRequest();
    return { title: config('app.name', 'Paymenter') };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
    const { locale } = await initRequest();

    // the admin panel has its own document (Filament's layout), the client area theme does not apply
    const path = await currentPath();
    if (path === '/admin' || path.startsWith('/admin/')) {
        return <AdminDocument locale={locale} flashed={await consumeFlashedNotifications()}>{children}</AdminDocument>;
    }

    const theme = await activeTheme();
    const flash = await readFlash();
    const favicon = setting<string | null>('favicon');

    return (
        <html lang={locale.replace('_', '-')} dir={isRtl(locale) ? 'rtl' : undefined} suppressHydrationWarning>
            <head>
                <link rel="stylesheet" href={`/build/themes/${activeThemeName()}/app.css`} precedence="default" />
                <theme.Head />
                {favicon ? <link rel="icon" href={storageUrl(favicon)} /> : null}
                <meta name="theme-color" content={themeSetting<string>('primary', '#000000')} />
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
                <Hook name="head" />
            </head>
            <body className="w-full bg-background text-base min-h-screen flex flex-col antialiased" suppressHydrationWarning>
                <Providers messages={clientMessages(locale)} locale={locale} availableLocales={availableLocales} flash={flash}>
                    <Hook name="body" />
                    {children}
                    <Hook name="footer" />
                </Providers>
            </body>
        </html>
    );
}
