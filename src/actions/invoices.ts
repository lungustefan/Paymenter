'use server';

import { action, flash, type ActionResult } from '@/server/action';
import { initRequest, requireUser } from '@/server/page';
import { dispatch } from '@/server/events';
import { Invoice } from '@/server/models/Invoice';
import { DisplayException } from '@/server/exceptions';
import { checkPaymentStatus, processPayment } from '@/server/services/invoice/InvoicePayment';
import { route, relativeUrl } from '@/server/routes';

async function ownedInvoice(id: number): Promise<Invoice> {
    const user = await requireUser({ verified: true });
    const invoice = await Invoice.find<Invoice>(id);
    if (!invoice || invoice.user_id !== user.id) throw new DisplayException('Unauthorized');
    return invoice;
}

/** `processPayment()` */
export async function processPaymentAction(invoiceId: number, selectedMethod: string | null, setAsDefault: boolean): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await requireUser({ verified: true });
        const invoice = await ownedInvoice(invoiceId);
        const result = await processPayment(user, invoice, selectedMethod, setAsDefault);
        return result;
    });
}

/** `exitPay()` */
export async function exitPayAction(invoiceId: number): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const invoice = await ownedInvoice(invoiceId);
        // Dispatch event so extensions can do their thing
        await dispatch('invoice.payment.cancelled', { invoice } as any);
        return { ok: true, redirect: relativeUrl(route('invoices.show', invoice)) };
    });
}

/** `checkPaymentStatus()` (polled every five seconds while a payment is processing) */
export async function checkPaymentStatusAction(invoiceId: number, lastChecked: string | null): Promise<{ paid: boolean; failed: boolean; checkedAt: string }> {
    await initRequest();
    const invoice = await ownedInvoice(invoiceId);
    return checkPaymentStatus(invoice, lastChecked);
}

void flash;
