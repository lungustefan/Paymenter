'use server';

import { redirect } from 'next/navigation';
import { action, type ActionResult } from '@/server/action';
import { initRequest } from '@/server/page';
import { validate, ValidationError, passwordRule } from '@/server/validation';
import { verifyCaptcha } from '@/server/auth/captcha';
import { RateLimiter, cacheGet, cachePut } from '@/server/cache';
import { getRequestInfo } from '@/server/request';
import { checkPassword, hashPassword } from '@/server/lib/crypto';
import { Carbon } from '@/server/lib/carbon';
import { setting } from '@/server/config';
import { login, getAuthUser } from '@/server/auth/session';
import { pullIntended } from '@/server/auth/intended';
import { sessionForget, sessionGet, sessionPut } from '@/server/session';
import { User } from '@/server/models/User';
import { route, url, relativeUrl } from '@/server/routes';
import { verifyCode } from '@/server/auth/tfa';
import { Password, PASSWORD_RESET } from '@/server/auth/passwords';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { initializeProperties, rulesForProperties, attributesForProperties, updateProperties } from '@/server/support/properties';
import { UserSession } from '@/server/models/UserSession';

/** Port of Livewire\Auth\{Login,Tfa,Register,VerifyEmail,Password\Request,Password\Reset} */

function fail(field: string, message: string): ActionResult {
    return { ok: false, errors: { [field]: [message] } };
}

export async function loginAction(input: { email: string; password: string; remember: boolean; captcha?: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        await verifyCaptcha(input.captcha);
        await validate(input, { email: 'required|email', password: 'required' }, { locale });

        const { ip } = await getRequestInfo();
        const key = `login:${input.email.toLowerCase()}:${ip}`;
        if (await RateLimiter.tooManyAttempts(key, 5)) {
            return fail('email', tr.t('auth.throttle', { seconds: await RateLimiter.availableIn(key) }));
        }
        await RateLimiter.hit(key);

        const user = await User.query().where('email', input.email).first();
        if (!user || !checkPassword(input.password, user.password as string)) return fail('email', tr.t('auth.failed'));

        // Check 2FA
        if (user.tfa_secret) {
            await sessionPut('2fa', { user_id: user.id, remember: input.remember, expires: Carbon.now().addMinutes(5).toDateTimeString() });
            return { ok: true, redirect: relativeUrl(route('2fa')) };
        }

        await RateLimiter.clear(key);
        await login(user, input.remember);
        const intended = await pullIntended(relativeUrl(route('dashboard')));
        return { ok: true, redirect: intended, hard: intended.startsWith('/admin') };
    });
}

function tfaSession(raw: any): { user_id: number; remember: boolean } | null {
    if (!raw || !raw.expires) return null;
    return Carbon.parse(raw.expires).lt(Carbon.now()) ? null : raw;
}

export async function verifyTfaAction(input: { code: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        await validate(input, { code: 'required|numeric' }, { locale });

        const session = tfaSession(await sessionGet('2fa', null));
        if (!session) {
            await sessionForget('2fa');
            return { ok: true, redirect: relativeUrl(route('login')) };
        }

        const rlKey = `2fa:${session.user_id}`;
        if (await RateLimiter.tooManyAttempts(rlKey, 5)) return fail('code', 'Too many attempts.');
        await RateLimiter.hit(rlKey);

        const user = await User.findOrFail<User>(session.user_id);
        if (!user.tfa_secret) return { ok: true, redirect: relativeUrl(route('login')) };

        if (!verifyCode(user.tfa_secret as string, input.code)) return fail('code', 'Invalid code.');

        // Check if code has been used before, preventing replay attacks
        const usedKey = `tfa_used_code_${user.id}_${input.code}`;
        if (await cacheGet(usedKey)) return fail('code', 'Invalid code.');
        await cachePut(usedKey, true, 60);

        await login(user, session.remember);
        await sessionForget('2fa');
        await RateLimiter.clear(rlKey);
        return { ok: true, redirect: relativeUrl(route('dashboard')) };
    });
}

export async function registerAction(input: Record<string, any> & { captcha?: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        if (setting('registration_disabled', false)) redirect('/');
        await verifyCaptcha(input.captcha);

        const { customProperties } = await initializeProperties(null, 'App\\Models\\User');
        const rules: Record<string, any> = {
            first_name: 'required|string|max:255',
            last_name: 'required|string|max:255',
            email: 'required|email|max:255|unique:users',
            password: ['required', 'confirmed', passwordRule({ min: 8, letters: true, numbers: true })],
        };
        if (setting('tos')) rules.tos = 'accepted';
        const validated = await validate(
            input,
            { ...rules, ...rulesForProperties(customProperties) },
            { locale, attributes: attributesForProperties(customProperties), messages: {} },
        );

        const user = await User.create({
            first_name: input.first_name,
            last_name: input.last_name,
            email: input.email,
            password: hashPassword(input.password),
        });
        if (validated.properties) await updateProperties(user, validated.properties, customProperties);

        await login(user);
        const intended = await pullIntended(relativeUrl(route('dashboard')));
        return { ok: true, redirect: intended, hard: intended.startsWith('/admin') };
    });
}

export async function sendVerificationAction(input: { captcha?: string }): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await getAuthUser();
        if (!user) redirect(relativeUrl(route('login')));
        await verifyCaptcha(input.captcha);
        const key = `email-verification${user.id}`;
        if (await RateLimiter.tooManyAttempts(key, 1)) return fail('code', 'Too many attempts. Try again later.');
        await NotificationHelper.emailVerificationNotification(user);
        await RateLimiter.hit(key, 120);
        return { ok: true, notify: { message: 'Verification email sent.', type: 'success' } };
    });
}

export async function requestPasswordResetAction(input: { email: string; captcha?: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        await verifyCaptcha(input.captcha);
        await validate(input, { email: 'required|email' }, { locale });

        const { ip } = await getRequestInfo();
        const key = `password-reset:${ip}`;
        if (await RateLimiter.tooManyAttempts(key, 3)) return fail('email', 'Too many password reset attempts. Please try again later.');
        await RateLimiter.hit(key, 60);

        const user = await User.query().where('email', input.email).first();
        if (user && !(await user.rel('role'))) {
            await NotificationHelper.passwordResetNotification(user, {
                url: url(route('password.reset', { token: await Password.createToken(user), email: user.email }, false)),
            });
        }
        return {
            ok: true,
            notify: { message: 'If the email address is associated with an account, you will receive an email with instructions on how to reset your password.', type: 'success' },
        };
    });
}

export async function resetPasswordAction(input: { token: string; email: string; password: string; password_confirmation: string; captcha?: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        await validate(input, { password: 'required|string|min:8|confirmed', password_confirmation: 'required' }, { locale });
        await verifyCaptcha(input.captcha);

        const status = await Password.reset({ email: input.email, token: input.token }, async (user) => {
            user.password = hashPassword(input.password);
            await user.save();
            // Revoke all existing sessions
            await UserSession.query().where('user_id', user.id).delete();
            const { dispatch } = await import('@/server/events');
            await dispatch('Illuminate\\Auth\\Events\\PasswordReset', { user });
        });
        if (status === PASSWORD_RESET) {
            return { ok: true, redirect: relativeUrl(route('login')) };
        }
        return { ok: false, notify: { message: tr.t(status), type: 'error' } };
    });
}

void ValidationError;
