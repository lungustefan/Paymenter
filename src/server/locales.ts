import data from './data/locales.json';

/** `config('app.available_locales')`: code => native language name */
export const availableLocales: Record<string, string> = data.available;
/** `config('app.rtl_locales')` */
export const rtlLocales: string[] = data.rtl;
export const isRtl = (locale: string) => rtlLocales.includes(locale);
