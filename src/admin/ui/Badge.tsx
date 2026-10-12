import type { ReactNode } from 'react';
import { badgeClass, type Size } from './classes';
import type { FilamentColorName } from './colors';
import { Icon } from './Icon';

/** `<x-filament::badge>` */
export function Badge({ color = 'primary', size = 'md', icon, iconPosition = 'before', className, children }: { color?: FilamentColorName | null; size?: Size | null; icon?: string | null; iconPosition?: 'before' | 'after'; className?: string; children: ReactNode }) {
    return (
        <span className={badgeClass({ color, size, extra: className })}>
            {icon && iconPosition === 'before' && <Icon icon={icon} size="sm" />}
            <span className="fi-badge-label-ctn">
                <span className="fi-badge-label">{children}</span>
            </span>
            {icon && iconPosition === 'after' && <Icon icon={icon} size="sm" />}
        </span>
    );
}
