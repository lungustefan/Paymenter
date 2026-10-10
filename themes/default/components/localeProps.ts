import { Cart } from '@/server/cart';
import { setting, config } from '@/server/config';
import { sessionGet } from '@/server/session';
import { Currency } from '@/server/models/Currency';
import { availableLocales } from '@/server/locales';
import { getLocale } from '@/server/page';

/** Data for `<LocaleSwitch>` (Livewire\Components\LocaleSwitch::mount) */
export async function localeSwitchProps() {
    const allowed = setting<string[]>('allowed_languages', []);
    const currencies = (await Currency.query().get()).map((c) => ({ value: c.code as string, label: c.name as string }));
    const cartEmpty = (await Cart.items()).length === 0;
    const currentLocale = await getLocale();
    const currentCurrency = await sessionGet<string>('currency', setting('default_currency'));
    void config;
    return {
        locales: allowed.map((code) => ({ value: code, label: availableLocales[code] ?? code })),
        currencies,
        currentLocale,
        currentCurrency,
        cartEmpty,
    };
}
