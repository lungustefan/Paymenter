import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { useDatabase } from '../../helpers/db';
import { Browser } from '../../helpers/http';
import { configSettings, createUser, PASSWORD_HASH } from '../../helpers/factories';
import LoginPage from '@/app/login/page';
import { GET as guestRoute } from '@/app/auth/guest/route';
import { loginAction } from '@/actions/auth';
import { getAuthUser } from '@/server/auth/session';
import { initRequest, requireUser } from '@/server/page';
import { INTENDED_COOKIE } from '@/server/auth/intended';

describe('Login', () => {
    useDatabase();

    let browser: Browser;
    beforeEach(() => {
        browser = new Browser();
    });

    const submit = async (email: string, password: string, extra: Record<string, unknown> = {}) =>
        (await browser.request(() => loginAction({ email, password, remember: false, ...extra }))).value!;
    const authUser = async () => (await browser.request(() => getAuthUser())).value;

    it('renders successfully', async () => {
        const { value, redirect } = await browser.request(() => LoginPage());

        expect(redirect).toBeUndefined();
        expect((value as any).props.view).toBe('auth.login');
    });

    it('cannot login with invalid credentials', async () => {
        const result = await submit('admin@paymenter', 'password');

        expect(result.ok).toBe(false);
        expect(result.errors?.email).toBeDefined();
    });

    it('can login with valid credentials', async () => {
        await createUser({ email: 'tests@paymenter.org', password: PASSWORD_HASH });

        const result = await submit('tests@paymenter.org', 'password');

        expect(result.errors).toBeUndefined();
        expect(result.redirect).toBe('/dashboard');
        expect((await authUser())?.email).toBe('tests@paymenter.org');
    });

    describe('with captcha enabled', () => {
        afterEach(() => vi.unstubAllGlobals());

        it('cannot login with a wrong or missing captcha', async () => {
            configSettings({
                captcha: 'recaptcha-v3',
                captcha_site_key: '6Lfi6dkkAAAAAMoS7Ya74nsiIQv840dQpPdDIYqT',
                captcha_secret: '6Lfi6dkkAAAAAEdMgMWZB0VqTh6lpeBHYoxff78n',
            });
            // the verification endpoint of the provider answers "invalid" (no network access needed)
            const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { headers: { 'content-type': 'application/json' } }));
            vi.stubGlobal('fetch', fetchMock);

            const wrong = await submit('test@paymenter.org', 'password', { captcha: 'wrong' });
            expect(wrong.errors?.captcha).toBeDefined();
            expect(fetchMock).toHaveBeenCalled();
            expect(await authUser()).toBeNull();

            // Test without captcha
            const missing = await submit('test@paymenter.org', 'password');
            expect(missing.errors?.captcha).toBeDefined();
            expect(await authUser()).toBeNull();
        });
    });

    it('redirects to the intended url after login', async () => {
        await createUser({ email: 'test@paymenter.org', password: PASSWORD_HASH, role_id: 1 });

        // a guest opening the admin panel is sent to the login page (through /auth/guest, which remembers the page)
        const guest = await browser.request(() => requireUser(), { path: '/admin/settings' });
        expect(guest.redirect).toBe('/auth/guest?to=' + encodeURIComponent('/admin/settings'));
        const res = guestRoute(new NextRequest(`http://localhost${guest.redirect}`));
        expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
        browser.cookies.set(INTENDED_COOKIE, res.cookies.get(INTENDED_COOKIE)!.value);

        const result = await submit('test@paymenter.org', 'password');
        expect(result.errors).toBeUndefined();
        expect(result.redirect).toBe('/admin/settings');
        expect((await authUser())?.email).toBe('test@paymenter.org');

        // and the admin panel is now accessible
        const { value } = await browser.request(async () => (await requireUser()).canAccessAdmin(), { path: '/admin/settings' });
        expect(value).toBe(true);
    });

    it('cannot go to the admin dashboard if not authenticated', async () => {
        const { redirect } = await browser.request(() => requireUser(), { path: '/admin/settings' });

        expect(redirect).toContain('/auth/guest?to=');
    });

    it('cannot go to the admin dashboard if authenticated but not an admin', async () => {
        const user = await createUser();
        await submit(user.email as string, 'password');

        const { value } = await browser.request(async () => {
            await initRequest();
            return (await requireUser()).canAccessAdmin();
        }, { path: '/admin/settings' });

        // the admin route responds with notFound() when this is false
        expect(value).toBe(false);
    });
});
