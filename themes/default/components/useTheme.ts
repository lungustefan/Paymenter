'use client';

import { useThemeMode } from './Providers';

/** true when the dark theme is active */
export function useTheme(): boolean {
    return useThemeMode().isDark;
}
