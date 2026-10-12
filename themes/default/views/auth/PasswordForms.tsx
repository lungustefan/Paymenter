'use client';

import { useRef, type ReactNode } from 'react';
import { requestPasswordResetAction, resetPasswordAction } from '@/actions/auth';
import { Input } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { Captcha, type CaptchaHandle } from '../../components/Captcha';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

type CaptchaConfig = { provider: string | null; siteKey: string };

const formClass = 'mx-auto flex flex-col gap-2 mt-4 px-6 sm:px-14 pb-10 bg-primary-800 rounded-md xl:max-w-[40%] w-full';

function Header({ logo, title }: { logo: ReactNode; title: string }) {
    return (
        <div className="flex flex-col items-center my-14">
            {logo}
            <h1 className="text-2xl text-center mt-6">{title} </h1>
        </div>
    );
}

/** Port of views/auth/password/request.blade.php + Livewire\Auth\Password\Request */
export function PasswordRequestForm({ logo, captcha }: { logo: ReactNode; captcha: CaptchaConfig }) {
    const { t } = useT();
    const form = useForm({ email: '', captcha: '' });
    const captchaRef = useRef<CaptchaHandle>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        let token = form.data.captcha;
        if (captcha.provider === 'recaptcha-v3') token = (await captchaRef.current?.execute()) ?? '';
        form.run(
            () => requestPasswordResetAction({ email: form.data.email, captcha: token }),
            () => {
                captchaRef.current?.reset();
                form.set('captcha', '');
            },
        );
    };

    return (
        <form className={formClass} onSubmit={submit} id="reset">
            <Header logo={logo} title={t('auth.reset_password')} />
            <Input type="text" label={t('general.input.email')} placeholder={t('general.input.email_placeholder')} required {...form.bind('email')} />

            <Captcha ref={captchaRef} provider={captcha.provider} siteKey={captcha.siteKey} onToken={(tok) => form.set('captcha', tok)} error={form.error('captcha')} />

            <PrimaryButton className="w-full" type="submit" pending={form.pending}>
                {t('auth.reset_password')}
            </PrimaryButton>
        </form>
    );
}

/** Port of views/auth/password/reset.blade.php + Livewire\Auth\Password\Reset */
export function PasswordResetForm({ logo, captcha, token, email }: { logo: ReactNode; captcha: CaptchaConfig; token: string; email: string }) {
    const { t } = useT();
    const form = useForm({ password: '', password_confirmation: '', captcha: '' });
    const captchaRef = useRef<CaptchaHandle>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        let tok = form.data.captcha;
        if (captcha.provider === 'recaptcha-v3') tok = (await captchaRef.current?.execute()) ?? '';
        form.run(
            () => resetPasswordAction({ token, email, password: form.data.password, password_confirmation: form.data.password_confirmation, captcha: tok }),
            () => {
                captchaRef.current?.reset();
                form.set('captcha', '');
            },
        );
    };

    return (
        <form className={formClass} onSubmit={submit} id="reset">
            <Header logo={logo} title={t('auth.reset_password')} />
            <Input type="text" name="email" label={t('general.input.email')} placeholder={t('general.input.email_placeholder')} value={email} readOnly required disabled />

            <Input type="password" label={t('general.input.password')} placeholder={t('general.input.password_placeholder')} required {...form.bind('password')} />
            <Input
                type="password"
                label={t('general.input.password_confirmation')}
                placeholder={t('general.input.password_confirmation_placeholder')}
                required
                {...form.bind('password_confirmation')}
                name="password_confirm"
                error={form.error('password_confirmation') ?? form.error('password_confirm')}
            />

            <Captcha ref={captchaRef} provider={captcha.provider} siteKey={captcha.siteKey} onToken={(tok) => form.set('captcha', tok)} error={form.error('captcha')} />

            <PrimaryButton className="w-full" type="submit" pending={form.pending}>
                {t('auth.reset_password')}
            </PrimaryButton>
        </form>
    );
}
