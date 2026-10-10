import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../../helpers/db';
import { Browser } from '../../helpers/http';
import RegisterPage from '@/app/register/page';
import { registerAction } from '@/actions/auth';
import { seedCustomProperties } from '@/server/db/seed';
import { CustomProperty } from '@/server/models/CustomProperty';
import { User } from '@/server/models/User';

describe('Register', () => {
    useDatabase();

    let browser: Browser;
    beforeEach(async () => {
        browser = new Browser();
        // the standard profile fields (phone, address, ...), none of them required for these tests
        await seedCustomProperties();
        for (const property of await CustomProperty.all<CustomProperty>()) {
            property.required = false;
            await property.save();
        }
    });

    const register = async (input: Record<string, unknown>) => (await browser.request(() => registerAction(input))).value!;

    it('renders successfully', async () => {
        const { value, redirect } = await browser.request(() => RegisterPage());

        expect(redirect).toBeUndefined();
        expect((value as any).props.view).toBe('auth.register');
    });

    it('can register with valid credentials', async () => {
        const result = await register({
            first_name: 'Corwin',
            last_name: 'Corwin',
            email: 'corwin@paymenter.org',
            password: 'passw0rd',
            password_confirmation: 'passw0rd',
        });

        expect(result.errors).toBeUndefined();
        expect(await User.query().where('email', 'corwin@paymenter.org').exists()).toBe(true);
    });

    it('cannot register with invalid credentials', async () => {
        const result = await register({
            first_name: 'Corwin',
            last_name: 'Corwin',
            email: 'corwin@paymenter.org',
            password: 'passw0rd',
            password_confirmation: 'pswrd',
        });

        expect(result.errors?.password).toBeDefined();
        expect(await User.query().where('email', 'corwin@paymenter.org').exists()).toBe(false);
    });

    it('requires the non-optional fields', async () => {
        for (const property of await CustomProperty.all<CustomProperty>()) {
            property.required = true;
            await property.save();
        }

        const result = await register({ email: 'corwin@paymenter.org', password: 'passw0rd', password_confirmation: 'passw0rd' });

        expect(result.errors?.first_name).toBeDefined();
        expect(result.errors?.last_name).toBeDefined();
        const keys = (await CustomProperty.all<CustomProperty>()).map((p) => `properties.${p.key}`);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) expect(result.errors?.[key], key).toBeDefined();
    });
});
