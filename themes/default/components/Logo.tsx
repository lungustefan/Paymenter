import { setting } from '@/server/config';
import { config } from '@/server/config';
import { storageUrl } from '@/server/routes';
import { cn } from './cn';

/** Port of components/logo.blade.php */
export function Logo({ className }: { className?: string }) {
    const light = setting<string | null>('logo');
    const dark = setting<string | null>('logo_dark');
    const alt = config('app.name');
    /* eslint-disable @next/next/no-img-element */
    if (light && dark) {
        return (
            <>
                <img src={storageUrl(light)} alt={alt} className={cn('w-auto inline-block dark:hidden', className)} />
                <img src={storageUrl(dark)} alt={alt} className={cn('w-auto hidden dark:inline-block', className)} />
            </>
        );
    }
    if (light) return <img src={storageUrl(light)} alt={alt} className={cn('w-auto inline-block', className)} />;
    if (dark) return <img src={storageUrl(dark)} alt={alt} className={cn('w-auto inline-block', className)} />;
    return null;
}
