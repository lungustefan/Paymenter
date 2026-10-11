import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentPath } from '@/server/request';
import { relativeUrl } from '@/server/routes';
import { cn } from './cn';

function pathOf(url: string): string {
    try {
        return new URL(url, 'http://x').pathname.replace(/\/+$/, '') || '/';
    } catch {
        return url;
    }
}

/** Port of components/navigation/link.blade.php (`spa` = `wire:navigate`). */
export async function NavLink({ href, spa = true, className, children }: { href: string; spa?: boolean; className?: string; children?: ReactNode }) {
    const current = (await currentPath()).replace(/\/+$/, '') || '/';
    const classes = cn('flex flex-row items-center p-3 gap-2 text-sm font-semibold text-wrap', pathOf(href) === current ? 'text-primary' : 'text-base hover:text-base/80', className);
    const rel = relativeUrl(href);
    if (!spa) {
        return (
            <a href={rel} className={classes}>
                {children}
            </a>
        );
    }
    return (
        <Link href={rel} className={classes}>
            {children}
        </Link>
    );
}
