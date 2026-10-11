import { Ri } from '@/components/icons/Ri';
import { Navigation, type NavItem } from '@/server/classes/Navigation';
import { LocaleSwitch } from './LocaleSwitch';
import { ThemeToggle } from './ThemeToggle';
import { NavLink } from './NavLink';
import { NavAccordion } from './NavAccordion';
import { cn } from './cn';
import { localeSwitchProps } from './localeProps';

async function Item({ nav, conditionOnChildren = false }: { nav: NavItem; conditionOnChildren?: boolean }) {
    return (
        <>
            {nav.children && nav.children.length > 0 ? (
                <NavAccordion initiallyOpen={!!nav.active} icon={nav.icon} active={!!nav.active} name={nav.name}>
                    {nav.children.map((child, i) =>
                        !conditionOnChildren || (child.condition ?? true) ? (
                            <div className="flex items-center space-x-2" key={i}>
                                <NavLink href={child.url ?? '#'} spa={child.spa ?? true} className={child.active ? 'text-primary font-bold' : ''}>
                                    {child.name}
                                </NavLink>
                            </div>
                        ) : null,
                    )}
                </NavAccordion>
            ) : (
                <div className={cn('flex items-center rounded-lg', nav.active ? 'bg-primary/5' : 'hover:bg-primary/5')}>
                    <NavLink href={nav.url ?? '#'} spa={nav.spa ?? true} className="w-full">
                        {nav.icon && <Ri name={nav.icon} className={cn('size-5', nav.active ? 'text-primary' : 'fill-base/50')} />}
                        {nav.name}
                    </NavLink>
                </div>
            )}
            {nav.separator !== undefined && <div className="h-px w-full bg-neutral"></div>}
        </>
    );
}

/** Port of components/navigation/sidebar-links.blade.php */
export async function SidebarLinks() {
    const links = await Navigation.getLinks();
    const dashboard = await Navigation.getDashboardLinks();
    const props = await localeSwitchProps();
    return (
        <div className="lg:px-4 lg:py-6 flex flex-col gap-2">
            <div className="flex flex-col gap-2 md:hidden">
                {links.map((nav, i) => (
                    <Item key={i} nav={nav} />
                ))}
            </div>

            <div className="flex flex-col gap-2">
                {dashboard.map((nav, i) => (
                    <Item key={i} nav={nav} conditionOnChildren />
                ))}
                <div className="flex flex-row items-center mt-4 justify-between md:hidden">
                    <LocaleSwitch {...props} />
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
