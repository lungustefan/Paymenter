import { Breadcrumb } from '@themes/default/components/Breadcrumb';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { url } from '@/server/routes';
import type { Affiliate } from './Affiliate';
import { AffiliateLink, SignupForm } from './AffiliateClient';

/** resources/views/index.blade.php */
export async function AffiliatePage({ affiliate, signupType }: { affiliate: Affiliate | null; signupType: string }) {
    const locale = await getLocale();
    const t = makeTranslator(locale).t;
    const number = (n: unknown) => new Intl.NumberFormat(locale.replace('_', '-')).format(Number(n));
    const earnings = affiliate ? Object.entries(await affiliate.earnings()) : [];

    return (
        <div className="container mt-14">
            <Breadcrumb />
            <div className="px-2">
                {affiliate ? (
                    <div className="mt-4 md:grid-cols-3 grid gap-4">
                        <div className="flex flex-col gap-1 bg-background-secondary p-4 rounded-lg">
                            <span className="text-xl font-semibold">{t('affiliates::affiliate.visitors')}</span>
                            <span className="text-gray-500">{t('affiliates::affiliate.total-visitors')}</span>
                            <span className="text-2xl font-semibold mt-1">{number(affiliate.visitors)}</span>
                        </div>
                        <div className="flex flex-col gap-1 bg-background-secondary p-4 rounded-lg">
                            <span className="text-xl font-semibold">{t('affiliates::affiliate.signups')}</span>
                            <span className="text-gray-500">{t('affiliates::affiliate.total-signups')}</span>
                            <span className="text-2xl font-semibold mt-1">{number(affiliate.signups)}</span>
                        </div>
                        <div className="flex flex-col gap-1 bg-background-secondary p-4 rounded-lg">
                            <span className="text-xl font-semibold">{t('affiliates::affiliate.earnings')}</span>
                            <span className="text-gray-500">{t('affiliates::affiliate.total-earnings')}</span>
                            <span className="text-2xl font-semibold mt-1">
                                <ul>
                                    {earnings.map(([currency, amount]) => (
                                        <li key={currency}>
                                            {currency}: {amount}
                                        </li>
                                    ))}
                                </ul>
                            </span>
                        </div>
                        <div className="col-span-3 flex flex-col mt-4">
                            <span className="text-xl font-semibold">{t('affiliates::affiliate.affiliate')}</span>
                            <span className="text-gray-500">{t('affiliates::affiliate.your-affiliate-link')}</span>
                            <AffiliateLink link={`${url('/')}?ref=${affiliate.code}`} copyLink={url('/?ref=' + affiliate.code)} copyLabel={t('affiliates::affiliate.copy')} />
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="mb-4">{t('affiliates::affiliate.you-havent-signed-up-yet')}</p>
                        <h3 className="text-lg font-bold mb-4">{t('affiliates::affiliate.signup-for-affiliate')}</h3>
                        <SignupForm custom={signupType === 'custom'} codeLabel={t('affiliates::affiliate.code')} signUpLabel={t('auth.sign_up')} />
                    </>
                )}
            </div>
        </div>
    );
}
