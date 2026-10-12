import type { RuleFn } from '@/server/validation';
import { t } from '@/server/i18n';
import { filterValidateDomain } from '@/server/lib/php';

export const Hostname = (): RuleFn => (value, fail) => {
    // rule objects are not run on empty values
    if (value === null || value === undefined || value === '') return;
    const v = String(value);
    if (!(v !== '0' && filterValidateDomain(v))) {
        fail(t('validation.hostname'));
    }
};
