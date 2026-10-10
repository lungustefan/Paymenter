import { Model } from '@/server/orm';
import { oauthRefreshTokens } from '@/server/db/schema';
import type { Row } from './_types';

export interface OauthRefreshToken extends Row<typeof oauthRefreshTokens> {}

/** Port of Laravel\Passport\RefreshToken (`oauth_refresh_tokens`). */
export class OauthRefreshToken extends Model {
    static table = oauthRefreshTokens;
    static morphName = 'Laravel\\Passport\\RefreshToken';
    static incrementing = false;
    static timestamps = false;
    static guarded: string[] = [];
    static casts = { revoked: 'boolean' };
}
