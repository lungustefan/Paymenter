import { Ri } from '@/components/icons/Ri';
import Link from 'next/link';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { relativeUrl, route } from '@/server/routes';
import { PrimaryButton } from '@themes/default/components/Button';
import { NavLink } from '@themes/default/components/NavLink';
import type { Announcement } from './Announcement';

const translator = async () => makeTranslator(await getLocale()).t;

/** resources/views/index.blade.php */
export async function AnnouncementsIndex({ announcements }: { announcements: Announcement[] }) {
    const t = await translator();
    return (
        <div className="container mt-14">
            {announcements.length > 0 && (
                <div className="flex flex-col gap-5">
                    <h2 className="text-xl font-semibold">{t('Announcements')}</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {announcements.map((announcement) => (
                            <div key={announcement.id} className="flex flex-col bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                                <h2 className="text-xl font-bold">{announcement.title}</h2>
                                <div className="my-2 text-sm text-base/70">{announcement.description}</div>
                                <Link href={relativeUrl(route('announcements.show', announcement as any))} className="mt-auto pt-2">
                                    <PrimaryButton>{t('common.button.view')}</PrimaryButton>
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** resources/views/show.blade.php */
export function AnnouncementsShow({ announcement }: { announcement: Announcement }) {
    return (
        <div className="container mt-14">
            <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg">
                <div className="flex flex-row justify-between mb-6">
                    <h2 className="text-xl font-bold">{announcement.title}</h2>
                    <p className="text-sm text-base">{announcement.published_at!.diffForHumans()}</p>
                </div>
                <article className="prose dark:prose-invert mb-2 max-w-full" dangerouslySetInnerHTML={{ __html: announcement.content }} />
            </div>
        </div>
    );
}

/** resources/views/widget.blade.php (the dashboard) */
export async function AnnouncementsWidget({ announcements }: { announcements: Announcement[] }) {
    if (announcements.length === 0) return null;
    const t = await translator();
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-background-secondary border border-neutral p-2 rounded-lg">
                        <Ri name="megaphone-fill" className="size-5" />
                    </div>
                    <h2 className="text-xl font-semibold">{t('Announcements')}</h2>
                </div>
            </div>
            <div className="space-y-4">
                <div className="space-y-4">
                    {announcements.map((announcement) => (
                        <Link key={announcement.id} href={relativeUrl(route('announcements.show', announcement as any))}>
                            <div className="bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-secondary/10 p-2 rounded-lg">
                                            <Ri name="newspaper-line" className="size-5 fill-secondary" />
                                        </div>
                                        <span className="font-medium">{announcement.title}</span>
                                    </div>
                                    <div className="prose dark:prose-invert text-sm">{announcement.published_at!.diffForHumans()}</div>
                                </div>
                                <p className="text-sm text-base/70">{announcement.description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <NavLink
                className="bg-background-secondary hover:bg-background-secondary/80 bg-background-secondary hover:bg-background-secondary/80 border border-neutral flex items-center justify-center rounded-lg flex items-center justify-center rounded-lg"
                href={route('announcements.index')}
            >
                {t('dashboard.view_all')}
                <Ri name="arrow-right-fill" className="size-5" />
            </NavLink>
        </div>
    );
}
