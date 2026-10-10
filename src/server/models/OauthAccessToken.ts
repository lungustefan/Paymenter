import { Model, belongsTo, hasOne } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { oauthAccessTokens } from '@/server/db/schema';
import type { Row } from './_types';
import { OauthClient } from './OauthClient';
import { OauthRefreshToken } from './OauthRefreshToken';

export interface OauthAccessToken extends Row<typeof oauthAccessTokens> {}

/** Port of Laravel\Passport\Token (`oauth_access_tokens`); `scopes` is a JSON array stored as text. */
export class OauthAccessToken extends Model<{ client: OauthClient | null; refreshToken: OauthRefreshToken | null }> {
    static table = oauthAccessTokens;
    static morphName = 'Laravel\\Passport\\Token';
    static incrementing = false;
    static guarded: string[] = [];
    static casts = { revoked: 'boolean' };
    static relations: Record<string, RelationDef> = {
        client: belongsTo(() => OauthClient, 'client_id'),
        refreshToken: hasOne(() => OauthRefreshToken, 'access_token_id'),
    };

    /** Decoded `scopes` column (Eloquent `array` cast). */
    scopeList(): string[] {
        return decodeScopes(this.scopes);
    }

    can(scope: string): boolean {
        const scopes = this.scopeList();
        return scopes.length > 0 && (scopes.includes('*') || scopes.includes(scope));
    }

    async revoke(): Promise<void> {
        this.revoked = true;
        await this.save();
    }
}

export function decodeScopes(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw !== 'string' || raw === '') return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.map(String) : [];
    } catch {
        return [];
    }
}
