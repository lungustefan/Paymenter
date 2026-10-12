import { Model } from '@/server/orm';
import type { Row } from '@/server/models/_types';
import { extAnnouncements } from './schema';

export interface Announcement extends Row<typeof extAnnouncements> {}

export class Announcement extends Model {
    static table = extAnnouncements;
    static morphName = 'Paymenter\\Extensions\\Others\\Announcements\\Models\\Announcement';
    static fillable = ['title', 'content', 'description', 'published_at', 'is_active', 'slug'];
    static casts = { published_at: 'datetime' };

    /** `{announcement:slug}` */
    static async resolveRouteBinding(value: string): Promise<Announcement | null> {
        return Announcement.query().where('slug', value).first();
    }
}
