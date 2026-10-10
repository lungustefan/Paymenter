import Link from 'next/link';
import { getCurrentUser, isImpersonating } from '@/server/auth/session';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { PrimaryButton } from './Button';

/** Port of components/impersonating.blade.php */
export async function Impersonating() {
    if (!(await isImpersonating())) return null;
    const user = await getCurrentUser();
    const t = makeTranslator(await getLocale()).t;
    return (
        <div className="fixed bottom-0 right-0 z-50 flex gap-2 justify-center items-center bg-background-secondary shadow-lg p-4 w-full border-t border-neutral">
            <p>
                {t('You are currently impersonating')}: <strong>{user?.displayName()}</strong>
            </p>
            <a href={`/admin/users/${user?.id}/edit`}>
                <PrimaryButton>{t('Leave')}</PrimaryButton>
            </a>
        </div>
    );
}
void Link;
