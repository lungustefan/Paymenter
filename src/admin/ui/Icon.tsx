import type { SVGProps } from 'react';
import { heroicons } from '../icons/heroicons';
import { remixIcons } from '@/components/icons/remix-icons';
import { cn } from '@themes/default/components/cn';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Filament's icon helper: `heroicon-o-trash`, `heroicon-m-plus`, ... and `ri-*` (Remix) names
 * rendered as `<svg class="fi-icon fi-size-md">`.
 */
export function Icon({ icon, size = 'md', className, ...rest }: { icon: string; size?: IconSize | null } & Omit<SVGProps<SVGSVGElement>, 'ref'>) {
    const classes = cn(className, 'fi-icon', size && `fi-size-${size}`);
    if (icon.startsWith('ri-')) {
        const inner = remixIcons[icon.replace(/^ri-/, '')] ?? '';
        return <svg className={classes} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-slot="icon" {...rest} dangerouslySetInnerHTML={{ __html: inner }} />;
    }
    const data = heroicons[icon];
    if (!data) return null;
    return (
        <svg
            className={classes}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={data.viewBox}
            fill={data.fill}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            aria-hidden="true"
            data-slot="icon"
            {...rest}
            dangerouslySetInnerHTML={{ __html: data.inner }}
        />
    );
}

/** `generate_loading_indicator_html()` */
export function LoadingIndicator({ size = 'md', className }: { size?: IconSize; className?: string }) {
    return (
        <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={cn(className, 'fi-icon fi-loading-indicator', `fi-size-${size}`)}>
            <path
                clipRule="evenodd"
                d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19ZM12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                fillRule="evenodd"
                fill="currentColor"
                opacity="0.2"
            />
            <path d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z" fill="currentColor" />
        </svg>
    );
}
