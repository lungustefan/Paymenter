import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { userSessions } from '@/server/db/schema';
import { Carbon } from '@/server/lib/carbon';
import { config } from '@/server/config';
import type { Row } from './_types';
import { User } from './User';

export interface UserSession extends Row<typeof userSessions> {}

/** Update last activity at most every 60 seconds */
const LAST_ACTIVITY_UPDATE = 60;

export class UserSession extends Model<{ user: User }> {
    static table = userSessions;
    static casts = { last_activity: 'datetime', expires_at: 'datetime' };
    static morphName = 'App\\Models\\UserSession';
    static timestamps = false;
    static fillable = ['user_id', 'ip_address', 'user_agent', 'last_activity', 'expires_at'];
    static uniqueIds = ['ulid'];
    static relations: Record<string, RelationDef> = { user: belongsTo(() => User, 'user_id') };

    /** Find a session that has not expired (remember sessions use `expires_at`, normal ones the inactivity timeout). */
    static async findValid(ulid: string): Promise<UserSession | null> {
        const now = Carbon.now();
        return UserSession.query()
            .where('ulid', ulid)
            .where((q) =>
                q
                    .where((q2) => q2.whereNotNull('expires_at').where('expires_at', '>', now))
                    .orWhere((q2) =>
                        q2.whereNull('expires_at').where('last_activity', '>', now.subMinutes(config('session.lifetime', 120))),
                    ),
            )
            .first();
    }

    async touchRequest(ip: string | null, userAgent: string | null): Promise<void> {
        const now = Carbon.now();
        if (!this.last_activity || Math.abs(this.last_activity.diffInSeconds(now)) >= LAST_ACTIVITY_UPDATE) {
            this.last_activity = now;
        }
        this.ip_address = ip;
        this.user_agent = (userAgent ?? '').slice(0, 512);
        await this.save();
    }

    get isMobile(): boolean {
        return /(android|webos|avantgo|blackberry|bolt|boost|cricket|docomo|fone|hiptop|mini|mobi|palm|phone|pie|tablet|up\.browser|up\.link|webos|wos)/i.test(
            this.user_agent ?? '',
        );
    }

    get formattedDevice(): string {
        return formatDevice(this.user_agent ?? '');
    }

    get formattedLastActive(): string {
        return this.last_activity ? this.last_activity.diffForHumans() : '';
    }
}

/** "Linux - Firefox" style label from a user agent. */
export function formatDevice(ua: string): string {
    let os: string;
    if (/Linux/i.test(ua)) os = 'Linux';
    else if (/Mac/i.test(ua)) os = 'Mac';
    else if (/iPhone/i.test(ua)) os = 'iPhone';
    else if (/iPad/i.test(ua)) os = 'iPad';
    else if (/Droid/i.test(ua)) os = 'Droid';
    else if (/Unix/i.test(ua)) os = 'Unix';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else os = 'Unknown';

    let br: string;
    if (/Firefox/i.test(ua)) br = 'Firefox';
    else if (/Chrome/i.test(ua)) br = 'Chrome';
    else if (/Safari/i.test(ua)) br = 'Safari';
    else if (/Opera/i.test(ua)) br = 'Opera';
    else if (/MSIE/i.test(ua)) br = 'IE';
    else br = 'Unknown';
    return `${os} - ${br}`;
}
