import type { SVGProps } from 'react';
import { paymentIcons } from './payment-icons';

/** `<x-icons.visa class="size-9" />` -> `<PaymentIcon name="visa" className="size-9" />` */
export function PaymentIcon({ name, className, ...props }: { name: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
    const icon = paymentIcons[name];
    if (!icon) return null;
    const { class: cls, viewBox, fill, xmlns } = icon.attrs;
    return <svg viewBox={viewBox} fill={fill} xmlns={xmlns} className={[cls, className].filter(Boolean).join(' ')} {...props} dangerouslySetInnerHTML={{ __html: icon.inner }} />;
}

/** The brand → icon switch of the payment method lists. Returns the icon name or null (generic card icon). */
export function brandIconName(type: string | null | undefined): string | null {
    switch ((type ?? '').toLowerCase()) {
        case 'visa':
            return 'visa';
        case 'mastercard':
            return 'mastercard';
        case 'amex':
            return 'amex';
        case 'american express':
            return 'american-express';
        case 'discover':
            return 'discover';
        case 'paypal':
            return 'paypal';
        case 'sepa_debit':
            return 'sepa';
        case 'ideal':
            return 'ideal';
        case 'bancontact':
            return 'bancontact';
        case 'sofort':
            return 'sofort';
        case 'us_bank_account':
        case 'bacs_debit':
        case 'au_becs_debit':
            return 'bank-debit';
        default:
            return null;
    }
}
