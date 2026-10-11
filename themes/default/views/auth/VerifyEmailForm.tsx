'use client';

import { useRef } from 'react';
import { sendVerificationAction } from '@/actions/auth';
import { PrimaryButton } from '../../components/Button';
import { Captcha, type CaptchaHandle } from '../../components/Captcha';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

/** Port of views/auth/verify-email.blade.php + Livewire\Auth\VerifyEmail */
export function VerifyEmailForm({ captcha }: { captcha: { provider: string | null; siteKey: string } }) {
    const { t } = useT();
    const form = useForm({ captcha: '' });
    const captchaRef = useRef<CaptchaHandle>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        let token = form.data.captcha;
        if (captcha.provider === 'recaptcha-v3') token = (await captchaRef.current?.execute()) ?? '';
        form.run(
            () => sendVerificationAction({ captcha: token }),
            () => {
                captchaRef.current?.reset();
                form.set('captcha', '');
            },
        );
    };

    return (
        <div className="mx-auto flex flex-col gap-2 mt-4 px-6 sm:px-14 py-10 bg-background-secondary rounded-md xl:max-w-[60%] w-full">
            <h1 className="text-2xl">{t('auth.verification.notice')}</h1>
            <p className="mt-2">{t('auth.verification.check_your_email')}</p>

            <form className="flex flex-col gap-2 mt-4" onSubmit={submit} id="verify-email">
                <Captcha ref={captchaRef} provider={captcha.provider} siteKey={captcha.siteKey} onToken={(tok) => form.set('captcha', tok)} error={form.error('captcha')} />

                <p className="text-base">{t('auth.verification.not_received')}</p>
                {form.error('code') && <p className="text-red-500 text-xs">{form.error('code')![0]}</p>}
                <PrimaryButton className="w-full" type="submit" pending={form.pending}>
                    {t('auth.verification.request_another')}
                </PrimaryButton>
            </form>
        </div>
    );
}
