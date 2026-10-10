'use client';

import { signupAction } from './actions';
import { Input } from '@themes/default/components/Form';
import { PrimaryButton } from '@themes/default/components/Button';
import { useForm } from '@themes/default/components/useForm';

/** the "your affiliate link" row of resources/views/index.blade.php (`copyToClipboard()`) */
export function AffiliateLink({ link, copyLink, copyLabel }: { link: string; copyLink: string; copyLabel: string }) {
    const copyToClipboard = (textToCopy: string) => {
        const temp = document.createElement('input');
        temp.type = 'text';
        temp.value = textToCopy;

        document.body.appendChild(temp);
        temp.select();
        document.execCommand('Copy');
        document.body.removeChild(temp);
    };

    return (
        <div className="flex flex-row gap-2 mt-2">
            <Input value={link} name="ref" divClass="!mt-0" type="text" readOnly />

            <PrimaryButton className="!w-fit" type="button" onClick={() => copyToClipboard(copyLink)}>
                {copyLabel}
            </PrimaryButton>
        </div>
    );
}

/** the signup form of resources/views/index.blade.php (`wire:submit.prevent="signup"`) */
export function SignupForm({ custom, codeLabel, signUpLabel }: { custom: boolean; codeLabel: string; signUpLabel: string }) {
    const form = useForm({ referral_code: '' });

    return (
        <form
            method="POST"
            onSubmit={(e) => {
                e.preventDefault();
                form.run(() => signupAction({ referral_code: form.data.referral_code }));
            }}
        >
            {custom && <Input type="text" label={codeLabel} required {...form.bind('referral_code')} />}

            <PrimaryButton type="submit" className="text-sm !w-fit mt-4" pending={form.pending}>
                {signUpLabel}
            </PrimaryButton>
        </form>
    );
}
