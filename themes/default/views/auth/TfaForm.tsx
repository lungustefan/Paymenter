'use client';

import { useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Ri } from '@/components/icons/Ri';
import { verifyTfaAction } from '@/actions/auth';
import { PrimaryButton } from '../../components/Button';
import { useForm } from '../../components/useForm';
import { useT } from '../../components/Providers';

const inputClass =
    'block w-9 rounded-lg border border-neutral px-2 py-1.5 text-center text-sm/6 placeholder-neutral/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-background';

/** Port of views/auth/2fa.blade.php + Livewire\Auth\Tfa */
export function TfaForm() {
    const { t } = useT();
    const form = useForm({ code: '' });
    const refs = useRef<(HTMLInputElement | null)[]>([]);
    const isNumber = (v: string) => /^[0-9]$/.test(v);
    const getCode = () => refs.current.map((r) => r?.value ?? '').join('');
    const [, force] = useState(0);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        const code = getCode();
        form.run(() => verifyTfaAction({ code }));
    };
    const fillInputs = (val: string) => {
        refs.current.forEach((r, i) => {
            if (r) r.value = val[i] || '';
        });
        force((n) => n + 1);
    };
    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const num = e.clipboardData.getData('text/plain').trim();
        if (num.length === 6 && /^[0-9]+$/.test(num)) {
            e.preventDefault();
            fillInputs(num);
            submit();
        }
    };
    const handleAutofill = (target: HTMLInputElement) => {
        const val = target.value;
        if (val.length === 6) {
            fillInputs(val);
            submit();
        } else {
            if (val.length > 1) target.value = val.charAt(0);
            if (isNumber(target.value)) refs.current[1]?.focus();
            else target.value = '';
        }
    };
    const later = (i: number) => ({
        ref: (el: HTMLInputElement | null) => {
            refs.current[i] = el;
        },
        onInput: () => {
            const el = refs.current[i]!;
            if (i === 5) {
                if (isNumber(el.value)) {
                    if (getCode().length === 6) submit();
                } else el.value = '';
            } else if (isNumber(el.value)) refs.current[i + 1]?.focus();
            else el.value = '';
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Backspace' && refs.current[i]!.value === '') refs.current[i - 1]?.focus();
        },
        type: 'text',
        inputMode: 'numeric' as const,
        pattern: '[0-9]*',
        autoComplete: 'off',
        maxLength: 1,
        className: inputClass,
    });

    return (
        <section className="mx-auto w-full max-w-lg py-14">
            <div className="card">
                <div className="flex flex-col items-center gap-2 p-5 sm:p-8 md:p-12">
                    <div className="flex items-center justify-center mb-4">
                        <Ri name="lock-password-fill" className="size-8" />
                    </div>
                    <h1 className="mb-2 text-2xl font-bold">{t('auth.verify_2fa')}</h1>
                    <p className="mb-6 text-base text-base/60">{t('account.input.two_factor_code')}</p>
                    <form onSubmit={submit} className="space-y-6">
                        <div className="inline-flex items-center gap-1.5">
                            <input
                                ref={(el) => {
                                    refs.current[0] = el;
                                }}
                                id="otp-input"
                                autoComplete="one-time-code"
                                onInput={(e) => handleAutofill(e.currentTarget)}
                                onPaste={handlePaste}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                autoFocus
                                className={inputClass}
                            />
                            <input {...later(1)} />
                            <input {...later(2)} />
                            <span className="text-sm text-base/60">-</span>
                            <input {...later(3)} />
                            <input {...later(4)} />
                            <input {...later(5)} />
                        </div>
                        {form.error('code') && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{form.error('code')![0]}</p>}
                        <div className="mt-2">
                            <PrimaryButton type="submit" className="" pending={form.pending}>
                                {t('auth.verify')}
                            </PrimaryButton>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
}
