'use client';

import { useT } from './Providers';
import { logoutAction } from '@/actions/shell';

/** Port of auth/logout.blade.php (`wire:click="logout"`) */
export function LogoutButton() {
    const { t } = useT();
    return (
        <div>
            <form action={logoutAction}>
                <button
                    type="submit"
                    className="flex flex-row items-center p-3 gap-2 text-sm font-semibold text-error/80 hover:text-error bg-background-secondary hover:bg-background-secondary/80"
                >
                    {t('auth.logout')}
                </button>
            </form>
        </div>
    );
}
