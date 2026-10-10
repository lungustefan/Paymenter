import { Model } from '@/server/orm';
import { oauthAuthCodes } from '@/server/db/schema';
import type { Row } from './_types';

export interface OauthAuthCode extends Row<typeof oauthAuthCodes> {}

/** Port of Laravel\Passport\AuthCode (`oauth_auth_codes`). */
export class OauthAuthCode extends Model {
    static table = oauthAuthCodes;
    static morphName = 'Laravel\\Passport\\AuthCode';
    static incrementing = false;
    static timestamps = false;
    static guarded: string[] = [];
    static casts = { revoked: 'boolean' };
}
