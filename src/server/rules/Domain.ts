import type { RuleFn } from '@/server/validation';
import { t } from '@/server/i18n';

/** Port of App\Rules\Domain (`new Domain`). */
export const Domain = (): RuleFn => (value, fail) => {
    // rule objects are not run on empty values
    if (value === null || value === undefined || value === '') return;
    if (!/^(?!:\/\/)(?=.{1,255}$)((.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i.test(String(value))) {
        fail(t('The :attribute is not a valid domain.'));
    }
};
