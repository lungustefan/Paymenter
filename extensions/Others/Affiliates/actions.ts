'use server';

import { action, type ActionResult } from '@/server/action';
import { initRequest, requireUser } from '@/server/page';
import { validate } from '@/server/validation';
import { t } from '@/server/i18n';
import { randomString } from '@/server/lib/ids';
import { ExtensionHelper } from '@/server/extensions/helper';
import { registerAffiliateRelation } from './relation';
import { Affiliate } from './Affiliate';

/** Livewire\Affiliates\Affiliate::signup() */
export async function signupAction(input: { referral_code: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        const user = await requireUser();
        registerAffiliateRelation();
        const signupType = String((await ExtensionHelper.getExtension('other', 'Affiliates')).config('type'));

        await validate(
            { referral_code: input.referral_code },
            { referral_code: [signupType === 'custom' ? 'required' : '', 'alpha_num:ascii', 'unique:ext_affiliates,code', 'min:5', 'max:25'].filter(Boolean) },
            { locale },
        );

        if (await user.rel('affiliate' as any)) {
            return { ok: true, notify: { message: t('affiliates::affiliate.you-are-already-affiliated', {}, locale), type: 'success' } };
        }

        await Affiliate.create({
            user_id: user.id,
            code: signupType === 'custom' ? input.referral_code : randomString(10),
            visitors: 0,
            reward: null,
            discount: null,
        });

        return { ok: true, notify: { message: t('affiliates::affiliate.signup-success', {}, locale), type: 'success' }, redirect: 'refresh' };
    });
}
