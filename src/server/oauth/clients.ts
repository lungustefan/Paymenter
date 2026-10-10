import { OauthClient } from '@/server/models/OauthClient';
import { OauthAccessToken } from '@/server/models/OauthAccessToken';
import { OauthRefreshToken } from '@/server/models/OauthRefreshToken';
import { randomString, uuid } from '@/server/lib/ids';

export { ensureOauthKeys } from './keys';

/**
 * `ClientRepository::createAuthorizationCodeGrantClient($name, $redirectUris)` of Passport: a confidential
 * client with the `authorization_code` + `refresh_token` grants and a random 40 character secret that is stored
 * hashed. `plainSecret` is the only time the secret is available - show it to the admin once.
 *
 * (CreateOauthClient.php also creates the encryption keys first - call `ensureOauthKeys()` before this.)
 */
export async function createAuthorizationCodeGrantClient(name: string, redirects: string[]): Promise<{ client: OauthClient; plainSecret: string }> {
    const plainSecret = randomString(40);
    const client = new OauthClient();
    client.forceFill({
        id: uuid(),
        user_id: null,
        name,
        secret: plainSecret,
        provider: null,
        redirect: redirects.join(','),
        personal_access_client: false,
        password_client: false,
        revoked: false,
    });
    await client.save();
    client.plainSecret = plainSecret;
    return { client, plainSecret };
}

/** `ClientRepository::regenerateSecret()`: a new random secret (hashed in the database); returns the plain secret. */
export async function regenerateClientSecret(client: OauthClient): Promise<string> {
    const plainSecret = randomString(40);
    client.forceFill({ secret: plainSecret });
    await client.save();
    client.plainSecret = plainSecret;
    return plainSecret;
}

/** `ClientRepository::update()` */
export async function updateClient(client: OauthClient, name: string, redirects: string[]): Promise<OauthClient> {
    client.forceFill({ name, redirect: redirects.join(',') });
    await client.save();
    return client;
}

/** `ClientRepository::delete()`: revokes the client and all of its access / refresh tokens. */
export async function revokeClient(client: OauthClient): Promise<void> {
    const tokens = await OauthAccessToken.query().where('client_id', client.id).get();
    for (const token of tokens) {
        await OauthRefreshToken.query().where('access_token_id', token.id).update({ revoked: true });
        await token.revoke();
    }
    client.forceFill({ revoked: true });
    await client.save();
}

/** `ClientRepository::findActive()` */
export async function findActiveClient(id: string): Promise<OauthClient | null> {
    const client = await OauthClient.find<OauthClient>(id);
    return client && !client.revoked ? client : null;
}
