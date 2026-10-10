import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { Browser, type RequestOptions } from '../helpers/http';
import { configSettings, createUser } from '../helpers/factories';
import { login } from '@/server/auth/session';
import { initRequest } from '@/server/page';
import type { User } from '@/server/models/User';

describe('LockSession', () => {
    useDatabase();

    let browser: Browser;
    beforeEach(() => {
        browser = new Browser();
    });

    /** `$this->withSession($this->loginUser($user))` */
    const loginUser = async (user: User, options: RequestOptions = {}) => {
        await browser.request(() => login(user), options);
    };
    /** a request to a page of the `web` middleware group: the session is validated, a locked session is sent to `/` */
    const visit = async (options: RequestOptions = {}) => {
        const result = await browser.request(() => initRequest(), options);
        return result.redirect ?? 'ok';
    };

    const admin = () => createUser({ role_id: 1 });
    const client = () => createUser({ role_id: null });
    const UA1 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    const UA2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

    it('stores the ip on the first request and allows the same ip', async () => {
        configSettings({ session_validation: 'ip_both' });
        await loginUser(await admin(), { ip: '1.2.3.4' });

        expect(await visit({ ip: '1.2.3.4' })).toBe('ok');
        // Second request with same IP should still be OK
        expect(await visit({ ip: '1.2.3.4' })).toBe('ok');
    });

    it('logs out and redirects when the ip changes', async () => {
        configSettings({ session_validation: 'ip_both' });
        await loginUser(await admin(), { ip: '1.2.3.4' });
        expect(await visit({ ip: '1.2.3.4' })).toBe('ok');

        // Second request from different IP should invalidate session
        expect(await visit({ ip: '5.6.7.8' })).toBe('/');
    });

    it('respects the ip_client setting for the client role', async () => {
        configSettings({ session_validation: 'ip_client' });
        await loginUser(await client(), { ip: '9.9.9.9' });
        expect(await visit({ ip: '9.9.9.9' })).toBe('ok');

        // Change client IP -> should redirect (locked)
        expect(await visit({ ip: '9.9.9.8' })).toBe('/');
    });

    it('stores the user agent and allows the same one for an admin', async () => {
        configSettings({ session_validation: 'user_agent_admin' });
        await loginUser(await admin(), { userAgent: UA1 });

        expect(await visit({ userAgent: UA1 })).toBe('ok');
        // Same UA should still be OK
        expect(await visit({ userAgent: UA1 })).toBe('ok');
    });

    it('redirects when the user agent changes for an admin', async () => {
        configSettings({ session_validation: 'user_agent_admin' });
        await loginUser(await admin(), { userAgent: UA1 });
        expect(await visit({ userAgent: UA1 })).toBe('ok');

        // Change UA -> should redirect
        expect(await visit({ userAgent: UA2 })).toBe('/');
    });

    it('respects the client role in user_agent_client mode', async () => {
        configSettings({ session_validation: 'user_agent_client' });
        await loginUser(await client(), { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
        expect(await visit({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('ok');

        // Change UA -> should redirect
        expect(await visit({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:120)' })).toBe('/');
    });

    it('allows all requests when validation is disabled', async () => {
        configSettings({ session_validation: 'none' });
        await loginUser(await admin(), { ip: '1.2.3.4', userAgent: 'TestAgent/1.0' });
        expect(await visit({ ip: '1.2.3.4', userAgent: 'TestAgent/1.0' })).toBe('ok');

        // Change both IP and UA -> should still be OK
        expect(await visit({ ip: '5.6.7.8', userAgent: 'AnotherAgent/2.0' })).toBe('ok');
    });

    it('validates both ip and user agent', async () => {
        configSettings({ session_validation: 'ip_user_agent_both' });
        const user = await client();
        await loginUser(user, { ip: '1.2.3.4', userAgent: UA1 });
        expect(await visit({ ip: '1.2.3.4', userAgent: UA1 })).toBe('ok');

        // Change only IP -> should redirect
        expect(await visit({ ip: '5.6.7.8', userAgent: UA1 })).toBe('/');

        // Reset to original IP and UA (a new login, the previous session was dropped)
        await loginUser(user, { ip: '1.2.3.4', userAgent: UA1 });
        expect(await visit({ ip: '1.2.3.4', userAgent: UA1 })).toBe('ok');

        // Change only UA -> should redirect
        expect(await visit({ ip: '1.2.3.4', userAgent: 'DifferentAgent/3.0' })).toBe('/');
    });
});
