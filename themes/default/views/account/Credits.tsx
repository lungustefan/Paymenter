import { setting } from '@/server/config';
import { sessionGet } from '@/server/session';
import { getCurrentUser } from '@/server/auth/session';
import { Currency } from '@/server/models/Currency';
import { ExtensionHelper } from '@/server/extensions/helper';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { Breadcrumb } from '../../components/Breadcrumb';
import { CreditsForm } from './CreditsForm';

/** Port of views/client/account/credits.blade.php */
export default async function Credits() {
    const t = makeTranslator(await getLocale()).t;
    const user = (await getCurrentUser())!;
    const credits = await user.rel('credits');
    const cards = await Promise.all(credits.map(async (c) => ({ code: ((await c.rel('currency'))?.code as string) ?? (c.currency_code as string), amount: String(await c.formattedAmount()) })));
    const currencies = (await Currency.query().get()).map((c) => c.code as string);

    const amount = setting<number>('credits_minimum_deposit');
    const currency = await sessionGet<string>('currency', setting('default_currency'));
    const gateways = (await ExtensionHelper.getCheckoutGateways(Number(amount), currency, 'credits')).map((g) => ({ id: g.id as number, name: g.name as string }));

    return (
        <div className="container mt-14">
            <Breadcrumb />
            <div className="px-2">
                <h4 className="text-2xl font-bold pb-3">{t('account.credits')}</h4>
                {cards.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                        {cards.map((c) => (
                            <div key={c.code} className="flex flex-col bg-background-secondary w-fit rounded-lg px-5 p-3 items-center gap-1">
                                <h5 className="text-lg font-bold">{c.code}</h5>
                                <p className="text-primary-100">{c.amount}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p>{t('account.no_credit')}</p>
                )}

                <h4 className="text-xl font-bold pb-3">{t('account.add_credit')}</h4>
                <CreditsForm currencies={currencies} initialCurrency={currency} initialAmount={String(amount ?? '')} initialGateways={gateways} />
            </div>
        </div>
    );
}
