import { hasOne } from '@/server/orm';
import { User } from '@/server/models/User';
import { Affiliate } from './Affiliate';

/** `User::resolveRelationUsing('affiliate', fn ($user) => $user->hasOne(Affiliate::class, 'user_id'))` */
export function registerAffiliateRelation() {
    (User.relations as Record<string, unknown>).affiliate ??= hasOne(() => Affiliate, 'user_id');
}
