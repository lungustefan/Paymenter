import type { ReactNode } from 'react';
import { activeTheme, themeView } from '@/server/theme-module';

/**
 * Renders a page the way a Livewire component does: the active theme's frame
 * (`layouts.app`) around the active theme's view.
 */
export async function ThemedPage({ view, props = {}, title, sidebar = false, children }: { view?: string; props?: Record<string, any>; title?: string; sidebar?: boolean; children?: ReactNode }) {
    const theme = await activeTheme();
    const View = view ? await themeView(view) : null;
    return (
        <theme.AppLayout title={title} sidebar={sidebar}>
            {View ? <View {...props} /> : null}
            {children}
        </theme.AppLayout>
    );
}
