import { Model, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { oauthClients } from '@/server/db/schema';
import type { Row } from './_types';
import { OauthAccessToken } from './OauthAccessToken';

export interface OauthClient extends Row<typeof oauthClients> {}

/**
 * Port of App\Models\OauthClient (extends Laravel\Passport\Client, v13.7.5).
 * The primary key is a UUID, the `secret` is stored hashed (bcrypt, `Hash::make`).
 */
export class OauthClient extends Model<{ tokens: OauthAccessToken[] }> {
    static table = oauthClients;
    static morphName = 'App\\Models\\OauthClient';
    static incrementing = false;
    static guarded: string[] = [];
    static hidden = ['secret'];
    static casts = { secret: 'hashed', personal_access_client: 'boolean', password_client: 'boolean', revoked: 'boolean' };
    static relations: Record<string, RelationDef> = {
        tokens: hasMany(() => OauthAccessToken, 'client_id'),
    };

    /** The temporary plain-text client secret (only set on the instance that generated it). */
    plainSecret: string | null = null;

    /** `redirect_uris` accessor: the legacy `redirect` column holds a comma separated list. */
    get redirect_uris(): string[] {
        return this.redirect ? String(this.redirect).split(',') : [];
    }

    /** `grant_types` accessor (no `grant_types` column in this schema, so Passport derives them). */
    get grant_types(): string[] {
        const map: Record<string, boolean> = {
            authorization_code: this.redirect_uris.length > 0,
            client_credentials: this.confidential() && this.firstParty(),
            implicit: this.redirect_uris.length > 0,
            password: !!this.password_client,
            personal_access: !!this.personal_access_client && this.confidential(),
            refresh_token: true,
            'urn:ietf:params:oauth:grant-type:device_code': true,
        };
        return Object.keys(map).filter((k) => map[k]);
    }

    firstParty(): boolean {
        return !this.user_id;
    }

    confidential(): boolean {
        return !!this.secret;
    }

    hasGrantType(grantType: string): boolean {
        return this.grant_types.includes(grantType);
    }

    /** Client scopes are not restricted (no `scopes` column). */
    hasScope(_scope: string): boolean {
        return true;
    }

    /** `Client::skipsAuthorization()` - always false in Passport's base class. */
    skipsAuthorization(_user: unknown, _scopes: string[]): boolean {
        return false;
    }
}
