'use client';

import { Ri } from '@/components/icons/Ri';
import { useThemeMode } from './Providers';

/** Port of components/theme-toggle.blade.php */
export function ThemeToggle() {
    const { mode, setMode } = useThemeMode();
    return (
        <button
            onClick={() => setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral transition text-base cursor-pointer"
            title={mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'}
        >
            {mode === 'light' && <Ri name="sun-fill" className="size-4" />}
            {mode === 'dark' && <Ri name="moon-fill" className="size-4" />}
            {mode === 'system' && <Ri name="computer-line" className="size-4" />}
        </button>
    );
}
