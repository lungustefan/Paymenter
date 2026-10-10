import Link from 'next/link';
import { config } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { PrimaryButton } from '../../components/Button';

/** Port of views/errors/404.blade.php */
export default async function NotFound() {
    const t = makeTranslator(await getLocale()).t;
    return (
        <>
            <title>{`${config('app.name', 'Paymenter')} - ${t('errors.404.title')}`}</title>
            <div className="container flex flex-col items-center justify-center text-center py-20">
                <p className="text-base font-semibold text-primary">404</p>
                <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance sm:text-7xl">{t('errors.404.title')}</h1>
                <p className="mt-6 text-lg font-medium text-pretty text-base/50 sm:text-xl/8">{t('errors.404.message')}</p>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                    <Link href={relativeUrl(route('home'))}>
                        <PrimaryButton>{t('errors.404.return_home')}</PrimaryButton>
                    </Link>
                </div>
            </div>
        </>
    );
}
