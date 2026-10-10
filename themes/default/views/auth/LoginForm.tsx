'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { loginAction } from '@/actions/auth';
import { Input, Checkbox } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { Captcha, type CaptchaHandle } from '../../components/Captcha';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

/** Port of views/auth/login.blade.php + Livewire\Auth\Login */
export function LoginForm({
    logo,
    hook,
    captcha,
    providers,
    registrationEnabled,
    links,
}: {
    logo: ReactNode;
    hook: ReactNode;
    captcha: { provider: string | null; siteKey: string };
    providers: string[];
    registrationEnabled: boolean;
    links: { passwordRequest: string; register: string; oauth: Record<string, string> };
}) {
    const { t } = useT();
    const form = useForm({ email: '', password: '', remember: false, captcha: '' });
    const captchaRef = useRef<CaptchaHandle>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        let token = form.data.captcha;
        if (captcha.provider === 'recaptcha-v3') token = (await captchaRef.current?.execute()) ?? '';
        form.run(
            () => loginAction({ ...form.data, captcha: token }),
            () => {
                captchaRef.current?.reset();
                form.set('captcha', '');
            },
        );
    };

    return (
        <form
            className="mx-auto flex flex-col gap-2 mt-4 px-6 sm:px-14 pb-10 bg-primary-800 rounded-md xl:max-w-[40%] w-full"
            onSubmit={submit}
            id="login"
        >
            <div className="flex flex-col items-center my-14">
                {logo}
                <h1 className="text-2xl text-center mt-6">{t('auth.sign_in_title')} </h1>
            </div>
            <Input
                type="email"
                label={t('general.input.email')}
                placeholder={t('general.input.email_placeholder')}
                hideRequiredIndicator
                required
                autoComplete="email"
                {...form.bind('email')}
            />
            <Input
                type="password"
                label={t('general.input.password')}
                placeholder={t('general.input.password_placeholder')}
                required
                hideRequiredIndicator
                autoComplete="current-password"
                {...form.bind('password')}
            />
            <div className="flex flex-row">
                <Checkbox label="Remember me" {...form.bindChecked('remember')} />
                <a className="text-sm text-secondary-500 text-secondary hover:underline ml-auto" href={links.passwordRequest}>
                    {t('auth.forgot_password')}
                </a>
            </div>

            <Captcha ref={captchaRef} provider={captcha.provider} siteKey={captcha.siteKey} onToken={(tok) => form.set('captcha', tok)} error={form.error('captcha')} />

            <PrimaryButton className="w-full" type="submit" pending={form.pending}>
                {t('auth.sign_in')}
            </PrimaryButton>

            {hook}

            {providers.length > 0 && (
                <div className="flex flex-col items-center mt-4">
                    <div className="my-5 flex items-center w-full">
                        <span aria-hidden="true" className="h-0.5 grow rounded bg-primary-700"></span>
                        <span className="rounded-full px-3 py-1 text-xs font-medium bg-primary-700 text-gray-200">{t('auth.or_sign_in_with')}</span>
                        <span aria-hidden="true" className="h-0.5 grow rounded bg-primary-700"></span>
                    </div>
                    <div className="flex flex-row flex-wrap justify-center mt-2 gap-4">
                        {providers.map((provider) => (
                            <a key={provider} href={links.oauth[provider]} className="flex items-center justify-center px-4 h-10 border border-neutral rounded-md text-primary-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/assets/images/${provider}-dark.svg`} alt={provider} className="size-5 mr-2 text-secondary" />
                                {t(provider.charAt(0).toUpperCase() + provider.slice(1))}
                            </a>
                        ))}
                    </div>
                </div>
            )}
            {registrationEnabled && (
                <div className="text-base text-center rounded-md py-2 mt-6 text-sm">
                    {t('auth.dont_have_account')}{' '}
                    <Link className="text-sm text-secondary-500 text-secondary hover:underline" href={links.register}>
                        {t('auth.sign_up')}
                    </Link>
                </div>
            )}
        </form>
    );
}
