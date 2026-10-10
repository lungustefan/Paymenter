import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** Port of components/loading.blade.php (shown while an action is pending) */
export function Loading({ className, show = true }: { className?: string; show?: boolean }) {
    if (!show) return null;
    return (
        <div role="status">
            <Ri name="loader-5-fill" aria-hidden="true" className={cn('size-6 me-2 fill-black animate-spin dark:fill-white', className)} />
            <span className="sr-only">Loading...</span>
        </div>
    );
}
