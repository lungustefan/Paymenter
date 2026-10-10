import { randomBytes } from 'node:crypto';
import { setting } from '@/server/config';
import { Http } from '@/server/http';
import { url } from '@/server/routes';

/**
 * Social login (the three Socialite providers of the PHP release: GitHub, Google, Discord) done with
 * the plain OAuth 2 authorization code flow.
 */
export type Provider = 'github' | 'google' | 'discord';
export const providers: Provider[] = ['github', 'google', 'discord'];

interface ProviderDef {
    authorize: string;
    token: string;
    scopes: string[];
    scopeSeparator: string;
    extra?: Record<string, string>;
}

const defs: Record<Provider, ProviderDef> = {
    github: { authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', scopes: ['user:email'], scopeSeparator: ',' },
    google: {
        authorize: 'https://accounts.google.com/o/oauth2/auth',
        token: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'profile', 'email'],
        scopeSeparator: ' ',
        extra: { access_type: 'online', approval_prompt: 'auto' },
    },
    discord: { authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/v10/oauth2/token', scopes: ['identify', 'email'], scopeSeparator: ' ', extra: { prompt: 'consent' } },
};

export const isProvider = (p: string): p is Provider => (providers as string[]).includes(p);
export const isEnabled = (p: Provider) => !!setting(`oauth_${p}`);

const credentials = (p: Provider) => ({ id: String(setting(`oauth_${p}_client_id`) ?? ''), secret: String(setting(`oauth_${p}_client_secret`) ?? '') });
const redirectUri = (p: Provider) => url(`/oauth/${p}/callback`);

export const newState = () => randomBytes(20).toString('hex');

export function authorizeUrl(p: Provider, state: string): string {
    const def = defs[p];
    const q = new URLSearchParams({
        client_id: credentials(p).id,
        redirect_uri: redirectUri(p),
        scope: def.scopes.join(def.scopeSeparator),
        response_type: 'code',
        state,
        ...(def.extra ?? {}),
    });
    return `${def.authorize}?${q.toString()}`;
}

export interface SocialUser {
    email: string | null;
    verified: boolean;
}

/** Exchange the code and fetch the profile (email + whether the provider verified it). */
export async function fetchUser(p: Provider, code: string): Promise<SocialUser> {
    const { id, secret } = credentials(p);
    const tokenRes = await Http.acceptJson()
        .asForm()
        .post(defs[p].token, { client_id: id, client_secret: secret, code, redirect_uri: redirectUri(p), grant_type: 'authorization_code' });
    const accessToken = tokenRes.json('access_token');
    if (!accessToken) throw new Error('No access token');

    if (p === 'github') {
        const profile = (await Http.acceptJson().withToken(accessToken).get('https://api.github.com/user')).json();
        let email: string | null = profile?.email ?? null;
        if (!email) {
            // like Socialite: fall back to the primary email address
            const emails = (await Http.acceptJson().withToken(accessToken).get('https://api.github.com/user/emails')).json() ?? [];
            email = (emails.find((e: any) => e.primary && e.verified) ?? emails.find((e: any) => e.primary))?.email ?? null;
        }
        return { email, verified: true };
    }
    if (p === 'google') {
        const profile = (await Http.acceptJson().withToken(accessToken).get('https://www.googleapis.com/oauth2/v3/userinfo')).json();
        return { email: profile?.email ?? null, verified: !!profile?.email_verified };
    }
    const profile = (await Http.acceptJson().withToken(accessToken).get('https://discord.com/api/v10/users/@me')).json();
    return { email: profile?.email ?? null, verified: profile?.verified !== false };
}
