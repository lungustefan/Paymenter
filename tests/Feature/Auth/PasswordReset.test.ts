import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../../helpers/db';
import { Browser } from '../../helpers/http';
import { createUser } from '../../helpers/factories';
import RequestPage from '@/app/password/request/page';
import { requestPasswordResetAction } from '@/actions/auth';
import { currentDb } from '@/server/orm';
import { passwordResetTokens } from '@/server/db/schema';

describe('PasswordReset', () => {
    useDatabase();

    let browser: Browser;
    beforeEach(() => {
        browser = new Browser();
    });

    const request = async (email: string) => (await browser.request(() => requestPasswordResetAction({ email }))).value!;
    const tokens = async () => (await currentDb().select().from(passwordResetTokens)) as { email: string }[];

    it('renders successfully', async () => {
        const { value, redirect } = await browser.request(() => RequestPage());

        expect(redirect).toBeUndefined();
        expect((value as any).props.view).toBe('auth.password.request');
    });

    it('can request a password reset link', async () => {
        await createUser({ email: 'test@example.com' });

        const result = await request('test@example.com');

        expect(result.errors).toBeUndefined();
        expect(result.notify?.type).toBe('success');
        const rows = await tokens();
        expect(rows).toHaveLength(1);
        expect(rows[0].email).toBe('test@example.com');
    });

    it('cannot request a password reset link with an invalid email', async () => {
        // This is default validation, not disclosing whether the email exists
        const result = await request('invalid-email');

        expect(result.errors?.email).toBeDefined();
    });

    it('cannot request a password reset link too many times', async () => {
        await createUser({ email: 'test@example.com' });

        for (let i = 0; i < 3; i++) {
            const result = await request('test@example.com');
            expect(result.errors).toBeUndefined();
            expect(result.notify?.type).toBe('success');
        }
        const result = await request('test@example.com');

        expect(result.errors?.email).toEqual(['Too many password reset attempts. Please try again later.']);
    });

    it('does not disclose non-existing emails', async () => {
        const result = await request('nonexistent@example.com');

        expect(result.errors).toBeUndefined();
        expect(result.notify?.type).toBe('success');
        expect(await tokens()).toHaveLength(0);
    });

    it('does not send reset links for admin users', async () => {
        await createUser({ email: 'admin@example.com', role_id: 1 });

        const result = await request('admin@example.com');

        expect(result.errors).toBeUndefined();
        expect(result.notify?.type).toBe('success');
        expect(await tokens()).toHaveLength(0);
    });
});
