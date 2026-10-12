import { notFound } from 'next/navigation';
import { Extension } from '@/server/extensions/Extension';
import type { ConfigDefinition, ExtensionPage } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { adminResourceUrl } from '@/server/admin/resources';
import { listen } from '@/server/events';
import { Carbon } from '@/server/lib/carbon';
import { Extension as ExtensionModel } from '@/server/models/Extension';
import { Announcement } from './Announcement';
import { AnnouncementsIndex, AnnouncementsShow, AnnouncementsWidget } from './views';

const migrations = 'extensions/Others/Announcements/database/migrations';

/** `Announcement::where('is_active', true)->where('published_at', '<=', now())` */
const published = () => Announcement.query().where('is_active', true).where('published_at', '<=', Carbon.now());

/** the extension can be disabled while the process keeps running: listeners check it when they fire */
const enabled = async () => !!(await ExtensionModel.query().where('extension', 'Announcements').where('enabled', true).first());

export default class Announcements extends Extension {
    static meta = {
        name: 'Announcements',
        description: 'Announcements extension',
        version: 'builtin',
        author: 'Paymenter',
        extensionId: 'unknown',
    };

    async getConfig(_values: Record<string, any> = {}): Promise<ConfigDefinition[]> {
        // If announcement resource is not installed, return placeholder
        if (await enabled()) {
            return [
                {
                    name: 'Notice',
                    type: 'placeholder',
                    label: 'You can use this extension to display announcements on the client area. To create a new announcement, go to <a class="text-primary-600" href="' + adminResourceUrl({ slug: 'announcements', modelLabel: 'announcement' }) + '">Announcements</a>.',
                    labelHtml: true,
                },
            ];
        }
        return [
            {
                name: 'Notice',
                type: 'placeholder',
                label: "You can use this extension to display announcements on the client area. You'll need to enable this extension above to get started.",
                labelHtml: true,
            },
        ];
    }

    async installed() {
        await ExtensionHelper.runMigrations(migrations);
    }

    async uninstalled() {
        // Rollback migrations
        await ExtensionHelper.rollbackMigrations(migrations);
    }

    boot() {
        if ((Announcements as any).listening) return;
        (Announcements as any).listening = true;

        listen('navigation', async () => {
            if (!(await enabled())) return;
            if ((await published().count()) == 0) {
                return;
            }

            return {
                name: 'Announcements',
                route: 'announcements.index',
                icon: 'ri-megaphone',
                separator: true,
                children: [],
            };
        });

        listen('permissions', async () => {
            if (!(await enabled())) return;
            return {
                'admin.announcements.view': 'View Announcements',
                'admin.announcements.create': 'Create Announcements',
                'admin.announcements.update': 'Update Announcements',
                'admin.announcements.delete': 'Delete Announcements',
            };
        });

        listen('pages.home', async () => {
            if (!(await enabled())) return;
            return {
                view: <AnnouncementsIndex announcements={await published().orderBy('published_at', 'desc').get()} />,
            };
        });

        listen('pages.dashboard', async () => {
            if (!(await enabled())) return;
            return {
                view: <AnnouncementsWidget announcements={await published().orderBy('published_at', 'desc').get()} />,
            };
        });
    }

    pages(): ExtensionPage[] {
        return [
            {
                name: 'announcements.index',
                path: '/announcements',
                async render() {
                    // Livewire\Announcements\Index::mount()
                    if ((await published().count()) == 0) notFound();
                    return <AnnouncementsIndex announcements={await published().orderBy('published_at', 'desc').get()} />;
                },
            },
            {
                name: 'announcements.show',
                path: '/announcements/{announcement:slug}',
                async render({ params }) {
                    const announcement = await Announcement.resolveRouteBinding(params.announcement);
                    if (!announcement) notFound();
                    // Livewire\Announcements\Show::mount()
                    if (!announcement.is_active || announcement.published_at! > Carbon.now()) notFound();
                    return <AnnouncementsShow announcement={announcement} />;
                },
            },
        ];
    }
}
