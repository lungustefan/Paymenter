'use client';

import { useT } from '../../components/Providers';

/** Port of views/errors/500.blade.php (client component: it is rendered by the error boundary) */
export default function ServerError() {
    const { t } = useT();
    return (
        <div className="container flex flex-col items-center justify-center text-center py-20">
            <p className="text-base font-semibold text-indigo-400">500</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance sm:text-7xl">{t('errors.500.title')}</h1>
            <p className="mt-6 text-lg font-medium text-pretty text-base/50 sm:text-xl/8">{t('errors.500.message')}</p>
        </div>
    );
}
