'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { registerAction } from '@/actions/auth';
import { Input, Checkbox } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { Captcha, type CaptchaHandle } from '../../components/Captcha';
import { Properties } from '../../components/Properties';
import type { CustomPropertyDef } from '../../components/propertiesData';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

/** Port of views/auth/register.blade.php + Livewire\Auth\Register */
export function RegisterForm({
    logo,
    captcha,
    customProperties,
    initialProperties,
    tos,
    loginUrl,
}: {
    logo: ReactNode;
    captcha: { provider: string | null; siteKey: string };
    customProperties: CustomPropertyDef[];
    initialProperties: Record<string, any>;
    tos: string | null;
    loginUrl: string;
}) {
    const { t } = useT();
    const form = useForm({ first_name: '', last_name: '', email: '', password: '', password_confirmation: '', tos: false, captcha: '', properties: initialProperties as Record<string, any> });
    const captchaRef = useRef<CaptchaHandle>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        let token = form.data.captcha;
        if (captcha.provider === 'recaptcha-v3') token = (await captchaRef.current?.execute()) ?? '';
        form.run(
            () => registerAction({ ...form.data, captcha: token }),
            () => {
                captchaRef.current?.reset();
                form.set('captcha', '');
            },
        );
    };

    return (
        <form className="mx-auto flex flex-col gap-2 mt-4 px-6 sm:px-14 pb-10 bg-primary-800 rounded-md xl:max-w-[60%] w-full" onSubmit={submit} id="register">
            <div className="flex flex-col items-center my-14">
                {logo}
                <h1 className="text-2xl text-center mt-6">{t('auth.sign_up_title')} </h1>
            </div>
            <div className="flex flex-col md:grid md:grid-cols-2 gap-4">
                <Input type="text" label={t('general.input.first_name')} placeholder={t('general.input.first_name_placeholder')} required {...form.bind('first_name')} />
                <Input type="text" label={t('general.input.last_name')} placeholder={t('general.input.last_name_placeholder')} required {...form.bind('last_name')} />

                <Input type="email" label={t('general.input.email')} placeholder={t('general.input.email_placeholder')} required divClass="col-span-2" {...form.bind('email')} />

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

                <Properties
                    customProperties={customProperties}
                    properties={form.data.properties}
                    onChange={(key, value) => form.set('properties', { ...form.data.properties, [key]: value })}
                    errors={form.errors}
                />

                {tos && (
                    <Checkbox required {...form.bindChecked('tos')}>
                        {t('product.tos')}{' '}
                        <a href={tos} target="_blank" className="text-primary hover:text-primary/80">
                            {t('product.tos_link')}
                        </a>
                    </Checkbox>
                )}
            </div>

            <Captcha ref={captchaRef} provider={captcha.provider} siteKey={captcha.siteKey} onToken={(tok) => form.set('captcha', tok)} error={form.error('captcha')} />

            <PrimaryButton className="w-full mt-2" pending={form.pending}>
                {t('auth.sign_up')}
            </PrimaryButton>

            <div className="text-base text-center rounded-md py-2 mt-6 text-sm">
                {t('auth.already_have_account')}{' '}
                <Link className="text-sm text-secondary-500 text-secondary hover:underline" href={loginUrl}>
                    {t('auth.sign_in')}
                </Link>
            </div>
        </form>
    );
}
