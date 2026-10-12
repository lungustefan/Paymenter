import type { NavigationItemInfo } from '../core/Resource';
import { Icon } from '../ui/Icon';
import { colorClass } from '../ui/colors';
import { SidebarLink } from './client';

export function SidebarItem({ item }: { item: NavigationItemInfo }) {
    return (
        <li className={`fi-sidebar-item${item.isActive ? ' fi-active' : ''} fi-sidebar-item-has-url`}>
            <SidebarLink href={item.url} className="fi-sidebar-item-btn" {...(item.isActive ? { 'aria-current': 'page' as const } : {})}>
                <Icon icon={item.isActive ? item.activeIcon : item.icon} size="lg" className="fi-sidebar-item-icon" />
                <span className="fi-sidebar-item-label">{item.label}</span>
                {item.badge ? (
                    <span className="fi-sidebar-item-badge-ctn">
                        <span className={`${colorClass('badge', (item.badgeColor as any) ?? 'primary')} fi-badge fi-size-md`}>
                            <span className="fi-badge-label-ctn">
                                <span className="fi-badge-label">{item.badge}</span>
                            </span>
                        </span>
                    </span>
                ) : null}
            </SidebarLink>
        </li>
    );
}

