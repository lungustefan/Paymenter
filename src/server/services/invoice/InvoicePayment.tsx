import type { ReactNode } from 'react';
import { transaction } from '@/server/orm';
import { ExtensionHelper } from '@/server/extensions/helper';
import { InvoiceTransactionStatus } from '@/server/enums';
import { Carbon } from '@/server/lib/carbon';
import { route } from '@/server/routes';
import { t } from '@/server/i18n';
import { Gateway } from '@/server/models/Gateway';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceItem } from '@/server/models/InvoiceItem';
import { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';

/** Payment logic of Livewire\Invoices\Show */

export interface PayOutcome {
    ok: boolean;
    notify?: { message: string; type: 'success' | 'error' };
    /** URL to continue at (soft navigation) */
    redirect?: string;
    /** the gateway's own payment form */
    view?: ReactNode;
    /** leave the page for an external payment page */
    hard?: boolean;
}

const error = (message: string): PayOutcome => ({ ok: false, notify: { message, type: 'error' } });

export async function checkoutGateways(invoice: Invoice) {
    return ExtensionHelper.getCheckoutGateways(await invoice.total(), invoice.currency_code as string, 'invoice', await invoice.rel('items'));
}

export function billingGateways(invoice: Invoice) {
    return ExtensionHelper.getBillingAgreementGateways();
}

/** Recurring services on this invoice (`recurringServices()`), used for "use as default payment method". */
export async function recurringServiceItems(invoice: Invoice): Promise<InvoiceItem[]> {
    const items = await invoice.relation<InvoiceItem>('items').where('reference_type', 'App\\Models\\Service').whereNotNull('reference_id').get();
    const out: InvoiceItem[] = [];
    for (const item of items) {
        const service = (await item.rel('reference')) as Service | null;
        if (!service) continue;
        const plan = await service.rel('plan');
        if (plan && !['one-time', 'free'].includes(plan.type as string)) out.push(item);
    }
    return out;
}

export async function processPayment(user: User, invoice: Invoice, selectedMethod: string | null, setAsDefault: boolean): Promise<PayOutcome> {
    if (invoice.status !== 'pending') return error(t('This invoice cannot be paid.'));
    if (selectedMethod === null || selectedMethod === '') return { ok: true };

    if (selectedMethod === 'credit') {
        const items = await invoice.rel('items');
        if (items.some((i) => i.reference_type === 'App\\Models\\Credit')) return error(t('This invoice cannot be paid with credits.'));
        return payWithCredit(user, invoice);
    }

    if (selectedMethod.startsWith('gateway-')) return payWithGateway(invoice, selectedMethod.slice(8));

    let notify: PayOutcome['notify'];
    if (setAsDefault) {
        const items = await recurringServiceItems(invoice);
        const agreement = await user.relation('billingAgreements').where('ulid', selectedMethod).first();
        if (agreement) {
            for (const item of items) {
                const service = (await item.rel('reference')) as Service;
                service.billing_agreement_id = agreement.id;
                await service.save();
            }
            if (items.length > 0) notify = { message: 'Default payment method has been updated for recurring services.', type: 'success' };
        }
    }
    const result = await payWithSavedMethod(user, invoice, selectedMethod);
    return { ...result, notify: result.notify ?? notify };
}

async function payWithGateway(invoice: Invoice, gatewayId: string): Promise<PayOutcome> {
    const gateways = await checkoutGateways(invoice);
    if (!gateways.map((g) => String(g.id)).includes(gatewayId)) return error(t('Invalid payment method.'));

    const gateway = await Gateway.query().where('id', gatewayId).first();
    const result = await ExtensionHelper.pay(gateway!, invoice);
    if (typeof result === 'string') return { ok: true, redirect: result, hard: true };
    if (result && typeof result === 'object' && 'redirect' in (result as any)) return { ok: true, redirect: String((result as any).redirect), hard: true };
    if (result && typeof result === 'object' && 'html' in (result as any)) return { ok: true, view: <div dangerouslySetInnerHTML={{ __html: String((result as any).html) }} /> };
    return { ok: true, view: result as ReactNode };
}

async function payWithCredit(user: User, invoice: Invoice): Promise<PayOutcome> {
    return transaction(async () => {
        const credit = await user.relation('credits').where('currency_code', invoice.currency_code).lockForUpdate().first();
        if (credit && Number(credit.amount) > 0) {
            const remaining = await invoice.remaining();
            // Is it more credits or less credits than the total price?
            if (Number(credit.amount) >= remaining) {
                credit.amount = Number(credit.amount) - remaining;
                await credit.save();
                await ExtensionHelper.addPayment(invoice.id as number, null, remaining, null, null, InvoiceTransactionStatus.Succeeded, true);
                return { ok: true, redirect: route('invoices.show', invoice, false) } as PayOutcome;
            }
            await ExtensionHelper.addPayment(invoice.id as number, null, Number(credit.amount), null, null, InvoiceTransactionStatus.Succeeded, true);
            credit.amount = 0;
            await credit.save();
            return { ok: true, notify: { message: t('Part of the invoice has been paid with credits. Please pay the remaining amount'), type: 'success' }, redirect: 'refresh' } as PayOutcome;
        }
        return { ok: true } as PayOutcome;
    });
}

async function payWithSavedMethod(user: User, invoice: Invoice, ulid: string): Promise<PayOutcome> {
    const agreement = await user.relation('billingAgreements').where('ulid', ulid).with('gateway').first();
    if (!agreement) return error(t('Invalid payment method.'));
    const gateway = (await agreement.rel('gateway'))!;
    const allowed = await billingGateways(invoice);
    if (!allowed.map((g) => g.id).includes(gateway.id)) return error(t('This payment method cannot be used for this invoice.'));

    const success = await ExtensionHelper.charge(gateway as any, invoice, agreement);
    if (success === true) {
        return { ok: true, notify: { message: t('Successfully charged the saved payment method.'), type: 'success' }, redirect: route('invoices.show', invoice, false) + '?checkPayment' };
    }
    return error(t('Could not process payment. Please try again or use a different payment method.'));
}

/** `checkPaymentStatus()` */
export async function checkPaymentStatus(invoice: Invoice, lastChecked: string | null): Promise<{ paid: boolean; failed: boolean; checkedAt: string }> {
    await invoice.refresh();
    if (lastChecked) {
        const failed = await invoice
            .relation('transactions')
            .where('status', InvoiceTransactionStatus.Failed)
            .where('updated_at', '>', Carbon.parse(lastChecked))
            .exists();
        if (failed) return { paid: false, failed: true, checkedAt: Carbon.now().toDateTimeString() };
    }
    return { paid: invoice.status === 'paid', failed: false, checkedAt: Carbon.now().toDateTimeString() };
}
