'use client';

import { useState } from 'react';
import { Ri } from '@/components/icons/Ri';
import { changePasswordAction, disableTwoFactorAction, enableTwoFactorAction, logoutSessionAction, startTwoFactorAction } from '@/actions/account';
import { Input } from '../../components/Form';
import { PrimaryButton } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { useForm } from '../../components/useForm';
import { useConfirm, useT } from '../../components/Providers';

export interface SessionView {
    id: number;
    ip: string;
    activity: string;
    device: string;
    current: boolean;
}

export function SessionsList({ sessions }: { sessions: SessionView[] }) {
    const { t } = useT();
    const form = useForm({});
    return (
        <div className="bg-background-secondary rounded-lg p-4">
            <h5 className="text-lg font-bold pb-3">{t('account.sessions')}</h5>
            {sessions.map((session) => (
                <div key={session.id} className="flex flex-row items-center justify-between py-2 border-b border-base/50">
                    <div>
                        <p className="text-sm text-primary-100">
                            {session.ip} - {session.activity}
                        </p>
                        <p className="text-sm text-primary-400">{session.device}</p>
                    </div>
                    {!session.current ? (
                        <PrimaryButton onClick={() => form.run(() => logoutSessionAction(session.id))} className="text-sm !w-fit">
                            {t('account.logout_sessions')}
                        </PrimaryButton>
                    ) : (
                        <span className="text-sm text-primary-300 italic">{t('account.current_device')}</span>
                    )}
                </div>
            ))}
        </div>
    );
}

export function ChangePassword() {
    const { t } = useT();
    const form = useForm({ current_password: '', password: '', password_confirmation: '' });
    return (
        <div className="bg-background-secondary rounded-lg p-4">
            <h5 className="text-lg font-bold pb-3">{t('account.change_password')}</h5>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.run(
                        () => changePasswordAction(form.data),
                        (r) => r.data && (r.data as any).reset && form.reset(),
                    );
                }}
            >
                <div className="grid grid-cols-2 gap-4">
                    <Input divClass="col-span-2" type="password" label={t('account.input.current_password')} placeholder={t('account.input.current_password_placeholder')} required {...form.bind('current_password')} />
                    <Input type="password" label={t('account.input.new_password')} placeholder={t('account.input.new_password_placeholder')} required {...form.bind('password')} />
                    <Input type="password" label={t('account.input.confirm_password')} placeholder={t('account.input.confirm_password_placeholder')} required {...form.bind('password_confirmation')} />
                </div>

                <PrimaryButton type="submit" className="w-full mt-4" pending={form.pending}>
                    {t('account.change_password')}
                </PrimaryButton>
            </form>
        </div>
    );
}

export function TwoFactor({ enabled }: { enabled: boolean }) {
    const { t } = useT();
    const confirm = useConfirm();
    const form = useForm({ code: '' });
    const [setup, setSetup] = useState<{ secret: string; image: string } | null>(null);

    return (
        <div className="bg-background-secondary rounded-lg p-4">
            <h5 className="text-lg font-bold pb-3">{t('account.two_factor_authentication')}</h5>
            {enabled ? (
                <>
                    <p className="text-sm text-primary-100">{t('account.two_factor_authentication_enabled')}</p>
                    <PrimaryButton
                        className="w-full mt-4"
                        onClick={() =>
                            confirm({
                                title: t('account.two_factor_authentication_disable'),
                                message: t('account.two_factor_authentication_disable_description'),
                                confirmText: t('account.confirm'),
                                cancelText: t('account.cancel'),
                                callback: async () => {
                                    form.apply(await disableTwoFactorAction());
                                },
                            })
                        }
                    >
                        {t('account.two_factor_authentication_disable')}
                    </PrimaryButton>
                </>
            ) : (
                <>
                    <p className="text-sm text-primary-100">{t('account.two_factor_authentication_description')}</p>
                    <PrimaryButton
                        onClick={() =>
                            form.startTransition(async () => {
                                const res = await startTwoFactorAction();
                                if (res.data) setSetup(res.data as any);
                            })
                        }
                        className="w-full mt-4"
                    >
                        {t('account.two_factor_authentication_enable')}
                    </PrimaryButton>
                    <Modal
                        open={!!setup}
                        title={t('account.two_factor_authentication_enable')}
                        closeTrigger={
                            <button onClick={() => document.location.reload()} className="text-primary-100">
                                <Ri name="close-fill" className="size-6" />
                            </button>
                        }
                    >
                        {setup && (
                            <>
                                <p className="text-primary-100">{t('account.two_factor_authentication_enable_description')}</p>
                                <div className="flex flex-col items-center mt-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={setup.image} alt="QR code" className="w-64 h-64" />
                                    <p className="text-primary-400 mt-2 text-sm text-center">
                                        {t('account.two_factor_authentication_secret')}
                                        <br />
                                        {setup.secret}
                                    </p>
                                </div>
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        form.run(() => enableTwoFactorAction({ secret: setup.secret, code: form.data.code }));
                                    }}
                                >
                                    <Input
                                        divClass="mt-8"
                                        type="text"
                                        label={t('account.input.two_factor_code')}
                                        placeholder={t('account.input.two_factor_code_placeholder')}
                                        required
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoComplete="one-time-code"
                                        name="two_factor_code"
                                        value={form.data.code}
                                        onChange={(e) => form.set('code', e.target.value)}
                                        error={form.error('twoFactorCode')}
                                    />
                                    <PrimaryButton className="w-full mt-4" type="submit" pending={form.pending}>
                                        {t('account.two_factor_authentication_enable')}
                                    </PrimaryButton>
                                </form>
                            </>
                        )}
                    </Modal>
                </>
            )}
        </div>
    );
}
