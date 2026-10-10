import Link from 'next/link';
import { Ri } from '@/components/icons/Ri';
import { Navigation as Nav } from '@/server/classes/Navigation';
import { Cart } from '@/server/cart';
import { config, setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { themeSetting } from '@/server/themes';
import { getCurrentUser } from '@/server/auth/session';
import { Notification } from '@/server/models/Notification';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { Logo } from './Logo';
import { NavLink } from './NavLink';
import { Dropdown } from './Dropdown';
import { PrimaryButton, SecondaryButton } from './Button';
import { MobileMenu, MobileUserPanel } from './MobileMenu';
import { SidebarLinks } from './SidebarLinks';
import { LocaleSwitch } from './LocaleSwitch';
import { ThemeToggle } from './ThemeToggle';
import { NotificationsMenu } from './NotificationsMenu';
import { LogoutButton } from './LogoutButton';
import { localeSwitchProps } from './localeProps';
import { cn } from './cn';

/** Port of components/navigation/index.blade.php + Livewire\Components\Cart */
export async function Navigation({ hasAside }: { hasAside: boolean }) {
    const t = makeTranslator(await getLocale()).t;
    const links = await Nav.getLinks();
    const accountLinks = await Nav.getAccountDropdownLinks();
    const user = await getCurrentUser();
    const cartCount = (await Cart.items()).length;
    const localeProps = await localeSwitchProps();
    const registrationEnabled = !setting('registration_disabled', false);
    const logoDisplay = themeSetting<string>('logo_display', 'logo-and-name');

    let notifications: any[] = [];
    if (user) {
        notifications = (await Notification.query().where('user_id', user.id).orderBy('created_at', 'desc').limit(5).get()).map((n) => ({
            id: n.id as number,
            title: n.title as string,
            body: n.body as string,
            read: !!n.read_at,
            createdHuman: (n.created_at as any)?.diffForHumans?.() ?? '',
        }));
    }
    const avatar = user?.avatarUrl() ?? '';
    const userName = user?.displayName() ?? '';

    const accountList = await Promise.all(
        accountLinks.map(async (nav, i) => (
            <NavLink key={i} href={nav.url ?? '#'} spa={nav.spa ?? true}>
                {nav.name}
            </NavLink>
        )),
    );

    /* eslint-disable @next/next/no-img-element */
    return (
        <nav className="w-full px-4 lg:px-8 bg-background-secondary border-b border-neutral md:h-16 flex md:flex-row flex-col justify-between fixed top-0 z-20">
            <div className="relative z-50 w-full h-auto">
                <div className={cn('flex flex-row items-center justify-between h-16', hasAside ? 'w-full' : 'container')}>
                    <div className="flex flex-row items-center">
                        <Link href={relativeUrl(route('home'))} className="flex flex-row items-center h-10 gap-2">
                            <Logo className="h-8" />
                            {logoDisplay !== 'logo-only' && <span className="text-xl font-bold leading-none flex items-center">{config('app.name')}</span>}
                        </Link>
                        <div className="md:flex hidden flex-row ml-6">
                            {links.map((nav, i) =>
                                nav.children && nav.children.length > 0 ? (
                                    <div className="relative" key={i}>
                                        <Dropdown
                                            trigger={
                                                <div className="flex flex-col">
                                                    <span className="flex flex-row items-center p-3 text-sm font-semibold whitespace-nowrap text-base hover:text-base/80">{nav.name}</span>
                                                </div>
                                            }
                                        >
                                            {nav.children.map((child, j) => (
                                                <NavLink key={j} href={child.url ?? '#'} spa={child.spa ?? true}>
                                                    {child.name}
                                                </NavLink>
                                            ))}
                                        </Dropdown>
                                    </div>
                                ) : (
                                    <NavLink key={i} href={nav.url ?? '#'} spa={nav.spa ?? true} className="flex items-center p-3">
                                        {nav.name}
                                    </NavLink>
                                ),
                            )}
                        </div>
                    </div>

                    <div className="flex flex-row items-center">
                        {cartCount > 0 && (
                            <div className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral transition relative">
                                <NavLink href={route('cart')}>
                                    <Ri name="shopping-bag-4-fill" className="size-4" />
                                    <div className="absolute inline-flex items-center justify-center w-4 h-4 font-bold text-white bg-primary rounded-full top-0 end-0">{cartCount}</div>
                                </NavLink>
                            </div>
                        )}

                        <div className="items-center hidden md:flex mr-1">
                            <LocaleSwitch {...localeProps} />
                            <ThemeToggle />
                        </div>

                        {user ? (
                            <>
                                <NotificationsMenu notifications={notifications} />
                                <div className="hidden lg:flex">
                                    <Dropdown
                                        showArrow={false}
                                        trigger={<img src={avatar} className="size-8 rounded-full border border-neutral bg-background" alt="avatar" />}
                                    >
                                        <div className="flex flex-col p-2">
                                            <span className="text-sm text-base break-words">{userName}</span>
                                            <span className="text-sm text-base break-words">{user.email}</span>
                                        </div>
                                        {accountList}
                                        <LogoutButton />
                                    </Dropdown>
                                </div>
                            </>
                        ) : (
                            <div className="hidden lg:flex flex-row gap-3">
                                <Link href={relativeUrl(route('login'))}>
                                    <SecondaryButton>{t('navigation.login')}</SecondaryButton>
                                </Link>
                                {registrationEnabled && (
                                    <Link href={relativeUrl(route('register'))}>
                                        <PrimaryButton>{t('navigation.register')}</PrimaryButton>
                                    </Link>
                                )}
                            </div>
                        )}
                        <MobileMenu>
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <SidebarLinks />
                            </div>
                            <div className="mt-5">
                                {user ? (
                                    <MobileUserPanel name={userName} email={user.email as string} avatar={avatar}>
                                        {accountList}
                                        <LogoutButton />
                                    </MobileUserPanel>
                                ) : (
                                    <div className="flex flex-col gap-3 mb-3">
                                        {registrationEnabled && (
                                            <Link href={relativeUrl(route('register'))}>
                                                <PrimaryButton>{t('navigation.register')}</PrimaryButton>
                                            </Link>
                                        )}
                                        <Link href={relativeUrl(route('login'))}>
                                            <SecondaryButton>{t('navigation.login')}</SecondaryButton>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </MobileMenu>
                    </div>
                </div>
            </div>
        </nav>
    );
}
