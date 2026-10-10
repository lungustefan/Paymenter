import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { Icon, LoadingIndicator, type IconSize } from './Icon';
import { badgeClass, buttonClass, iconButtonClass, linkClass, type Size } from './classes';
import type { FilamentColorName } from './colors';

interface BaseProps {
    color?: FilamentColorName | null;
    size?: Size | null;
    icon?: string | null;
    iconPosition?: 'before' | 'after';
    iconSize?: IconSize | null;
    href?: string | null;
    target?: string | null;
    tooltip?: string | null;
    disabled?: boolean;
    badge?: ReactNode;
    badgeColor?: FilamentColorName;
    className?: string;
    children?: ReactNode;
}

function Anchor({ href, target: targetProp, className, children, ...rest }: { href: string; target?: string | null; className: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href' | 'className' | 'target'>) {
    const target = targetProp ?? undefined;
    // admin links navigate client side (`wire:navigate` in SPA mode)
    if (target === '_blank' || /^https?:\/\//.test(href)) {
        return (
            <a href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} className={className} {...rest}>
                {children}
            </a>
        );
    }
    return (
        <Link href={href} className={className} {...(rest as any)}>
            {children}
        </Link>
    );
}
function Badge({ badge, badgeColor = 'primary', badgeSize = 'xs' }: { badge: ReactNode; badgeColor?: FilamentColorName; badgeSize?: Size }) {
    return <span className={badgeClass({ color: badgeColor, size: badgeSize })}>{badge}</span>;
}

/** `<x-filament::button>` */
export function Button({ color = 'primary', size = 'md', outlined = false, icon, iconPosition = 'before', iconSize, href, target, disabled, badge, badgeColor, className, labeledFrom, grouped, children, type = 'button', ...rest }: BaseProps & { outlined?: boolean; labeledFrom?: string | null; grouped?: boolean; type?: 'button' | 'submit' | 'reset' } & Omit<ComponentProps<'button'>, 'color' | 'type'>) {
    const classes = buttonClass({ color, outlined, size, disabled, labeledFrom, grouped, extra: className });
    const iconEl = icon ? <Icon icon={icon} size={iconSize ?? (size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null)} /> : null;
    const content = (
        <>
            {iconPosition === 'before' && iconEl}
            {children}
            {iconPosition === 'after' && iconEl}
            {badge ? (
                <div className="fi-btn-badge-ctn">
                    <Badge badge={badge} badgeColor={badgeColor} />
                </div>
            ) : null}
        </>
    );
    if (href) {
        return (
            <Anchor href={href} target={target} className={classes}>
                {content}
            </Anchor>
        );
    }
    return (
        <button type={type} className={classes} disabled={disabled} {...rest}>
            {content}
        </button>
    );
}

/** `<x-filament::link>` */
export function LinkButton({ color = 'primary', size = 'md', icon, iconPosition = 'before', iconSize, href, target, disabled, className, labelSrOnly, children, weight, ...rest }: BaseProps & { labelSrOnly?: boolean; weight?: string | null } & Omit<ComponentProps<'button'>, 'color'>) {
    const classes = linkClass({ color, size, disabled, weight, extra: className });
    const sz = iconSize ?? (size === 'xs' || size === 'sm' ? 'sm' : null);
    const iconEl = icon ? <Icon icon={icon} size={sz} /> : null;
    const content = (
        <>
            {iconPosition === 'before' && iconEl}
            {!labelSrOnly && <span className="fi-link-label">{children}</span>}
            {iconPosition === 'after' && iconEl}
        </>
    );
    if (href) {
        return (
            <Anchor href={href} target={target} className={classes}>
                {content}
            </Anchor>
        );
    }
    return (
        <button type="button" className={classes} disabled={disabled} {...rest}>
            {content}
        </button>
    );
}

/** `<x-filament::icon-button>` */
export function IconButton({ color = 'primary', size = 'md', icon, iconSize, href, target, disabled, label, badge, badgeColor, className, ...rest }: BaseProps & { label?: string } & Omit<ComponentProps<'button'>, 'color'>) {
    const classes = iconButtonClass({ color, size, disabled, extra: className });
    const sz = iconSize ?? (size === 'xs' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : null);
    const content = (
        <>
            {icon && <Icon icon={icon} size={sz} />}
            {badge ? (
                <div className="fi-icon-btn-badge-ctn">
                    <Badge badge={badge} badgeColor={badgeColor} />
                </div>
            ) : null}
        </>
    );
    if (href) {
        return (
            <Anchor href={href} target={target} className={classes} title={label} aria-label={label}>
                {content}
            </Anchor>
        );
    }
    return (
        <button type="button" className={classes} title={label} aria-label={label} disabled={disabled} {...rest}>
            {content}
        </button>
    );
}

/** `<x-filament::badge>` */
export function BadgeLabel({ color = 'primary', size = 'md', icon, iconPosition = 'before', className, children }: { color?: FilamentColorName | null; size?: Size; icon?: string | null; iconPosition?: 'before' | 'after'; className?: string; children?: ReactNode }) {
    const iconEl = icon ? <Icon icon={icon} size="sm" /> : null;
    return (
        <span className={badgeClass({ color, size, extra: className })}>
            {iconPosition === 'before' && iconEl}
            <span className="fi-badge-label-ctn">
                <span className="fi-badge-label">{children}</span>
            </span>
            {iconPosition === 'after' && iconEl}
        </span>
    );
}

export { LoadingIndicator };
