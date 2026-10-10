import { cn } from '@themes/default/components/cn';
import { colorClass, type FilamentColorName } from './colors';

export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** classes of `<x-filament::button>` */
export function buttonClass({ color = 'primary', outlined = false, size = 'md', disabled = false, labeledFrom, grouped, extra }: { color?: FilamentColorName | null; outlined?: boolean; size?: Size | null; disabled?: boolean; labeledFrom?: string | null; grouped?: boolean; extra?: string }): string {
    return cn(extra, 'fi-btn', disabled && 'fi-disabled', outlined && 'fi-outlined', size && `fi-size-${size}`, labeledFrom && `fi-labeled-from-${labeledFrom}`, colorClass(outlined ? 'buttonOutlined' : 'button', color), grouped && 'fi-ac-btn-group');
}

/** classes of `<x-filament::link>` */
export function linkClass({ color = 'primary', size = 'md', disabled = false, weight, extra }: { color?: FilamentColorName | null; size?: Size | null; disabled?: boolean; weight?: string | null; extra?: string }): string {
    return cn(extra, 'fi-link', disabled && 'fi-disabled', size && `fi-size-${size}`, weight && `fi-font-${weight}`, colorClass('link', color));
}

/** classes of `<x-filament::icon-button>` */
export function iconButtonClass({ color = 'primary', size = 'md', disabled = false, extra }: { color?: FilamentColorName | null; size?: Size | null; disabled?: boolean; extra?: string }): string {
    return cn(extra, 'fi-icon-btn', disabled && 'fi-disabled', size && `fi-size-${size}`, colorClass('iconButton', color));
}

/** classes of `<x-filament::badge>` */
export function badgeClass({ color = 'primary', size = 'md', disabled = false, extra }: { color?: FilamentColorName | null; size?: Size | null; disabled?: boolean; extra?: string }): string {
    return cn(extra, 'fi-badge', disabled && 'fi-disabled', size && `fi-size-${size}`, colorClass('badge', color));
}

/** the icon size a button / link of a size uses */
export function iconSizeFor(kind: 'button' | 'link' | 'iconButton' | 'badge', size: Size | null | undefined): 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | null {
    if (kind === 'button') return size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null === size ? null : null;
    if (kind === 'iconButton') return size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null;
    if (kind === 'link') return size === 'xs' || size === 'sm' ? 'sm' : null;
    return 'sm';
}
