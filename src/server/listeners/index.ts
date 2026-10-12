import { listen } from '@/server/events';
import { Events } from '@/server/event-defs';
import { dispatchJob } from '@/server/queue';
import { transaction } from '@/server/orm';
import { Carbon } from '@/server/lib/carbon';
import { config, setting } from '@/server/config';
import { strPad } from '@/server/lib/php';
import { InvoiceTransactionStatus } from '@/server/enums';
import { createInvoiceSnapshot } from '@/server/services/invoice/CreateInvoiceSnapshotService';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { getRequestInfo } from '@/server/request';
import { Service } from '@/server/models/Service';
import { Setting } from '@/server/models/Setting';
import { UserAuthenticationLog } from '@/server/models/UserAuthenticationLog';
import { formatDevice } from '@/server/models/UserSession';
import { isAllowedPushEndpoint } from '@/server/support/push-endpoint';
import { storageUrl } from '@/server/routes';
import { onLoginCart, onLogoutCart } from '@/server/cart/listener';

/**
 * Port of app/Listeners/*. Registration order follows the alphabetical class
 * order that Laravel's event auto-discovery used.
 */
let registered = false;

export function registerListeners() {
    if (registered) return;
    registered = true;

    /* CancellationCreatedListener (ShouldQueue) */
    listen(
        Events.ServiceCancellation.Created,
        async ({ cancellation }) => {
            if (cancellation.type !== 'immediate') return; // scheduled cancellations are handled by the cron job
            const service = (await cancellation.rel('service'))!;
            if ([Service.STATUS_ACTIVE, Service.STATUS_SUSPENDED].includes(service.status)) {
                await dispatchJob('server.terminate', { service });
            }
            await service.update({ status: 'cancelled' });
            await service.relation('invoices').where('status', 'pending').update({ status: 'cancelled' });
            const product = (await service.rel('product'))!;
            if (product.stock) await product.increment('stock', service.quantity);
        },
        { queued: true, name: 'CancellationCreatedListener' },
    );

    /* CreateInvoiceSnapshotListener */
    listen(Events.Invoice.Paid, async ({ invoice }) => {
        await createInvoiceSnapshot(invoice);
    });

    /* InvoiceNumberListener (invoices and credit/debit notes) */
    const setNumber = async (model: any, prefix: 'invoice' | 'credit_note') => {
        const formatted = await transaction(async () => {
            const key = `${prefix}_number`;
            const row = await Setting.query().where('key', key).lockForUpdate().first();
            const number = Number.parseInt(String(row?.value ?? 0), 10) + 1;
            await Setting.updateOrCreate({ key }, { value: number });
            return formatInvoiceNumber(number, prefix);
        });
        model.number = formatted;
    };
    listen(Events.Invoice.Creating, async ({ invoice }) => {
        if (!setting('invoice_proforma', false)) await setNumber(invoice, 'invoice');
    });
    listen(Events.Invoice.Updating, async ({ invoice }) => {
        const toPendingOrPaid = invoice.isDirty('status') && ['pending', 'paid'].includes(invoice.status);
        if (toPendingOrPaid && !invoice.number) await setNumber(invoice, 'invoice');
    });
    listen(Events.AdjustmentNote.Creating, async ({ adjustmentNote }) => {
        await setNumber(adjustmentNote, 'credit_note');
    });

    /* InvoiceTransactionCreatedListener */
    const settle = async ({ invoiceTransaction }: { invoiceTransaction: any }) => {
        const invoice = (await invoiceTransaction.rel('invoice'))!;
        // `remaining` needs fresh transactions
        invoice.unsetRelation('transactions');
        if ((await invoice.remaining()) <= 0 && invoice.status !== 'paid') {
            invoice.status = 'paid';
            await invoice.save();
        }
    };
    listen(Events.InvoiceTransaction.Created, settle);
    listen(Events.InvoiceTransaction.Updated, settle);

    /* NotificationCreatedListener (ShouldQueue): web push */
    listen(
        Events.Notification.Created,
        async ({ notification }) => {
            const user = await notification.rel('user');
            const subscriptions = await user.rel('pushSubscriptions');
            if (subscriptions.length === 0) return;
            const webpush = (await import('web-push')).default;
            webpush.setVapidDetails(config('app.url'), setting('vapid_public_key'), setting('vapid_private_key'));
            const logo = storageUrl(setting('logo'));
            const payload = JSON.stringify({
                title: notification.title,
                body: notification.body,
                icon: logo,
                badge: logo,
                url: notification.url,
                show_in_app: notification.show_in_app,
                show_as_push: notification.show_as_push,
            });
            for (const sub of subscriptions) {
                try {
                    if (!isAllowedPushEndpoint(sub.endpoint)) continue;
                    await webpush.sendNotification(sub.subscription() as any, payload);
                } catch (e: any) {
                    // Remove expired subscription from database
                    if (e?.statusCode === 404 || e?.statusCode === 410) await sub.delete();
                }
            }
        },
        { queued: true, name: 'NotificationCreatedListener' },
    );

    /* SendMailListener */
    listen(Events.Invoice.Finalized, async ({ invoice, sendEmail }) => {
        if (sendEmail === false) return;
        const user = await invoice.rel('user');
        if (user) await NotificationHelper.invoiceCreatedNotification(user, invoice);
    });
    listen(Events.Invoice.Paid, async ({ invoice }) => {
        const user = await invoice.rel('user');
        if (user) await NotificationHelper.invoicePaidNotification(user, invoice);
    });
    const failed = async ({ invoiceTransaction }: { invoiceTransaction: any }) => {
        if (invoiceTransaction.status === InvoiceTransactionStatus.Failed) {
            const invoice = (await invoiceTransaction.rel('invoice'))!;
            const user = await invoice.rel('user');
            if (user) await NotificationHelper.invoicePaymentFailedNotification(user, invoice);
        }
    };
    listen(Events.InvoiceTransaction.Created, failed);
    listen(Events.InvoiceTransaction.Updated, failed);
    listen(Events.User.Created, async ({ user }) => {
        await NotificationHelper.emailVerificationNotification(user);
    });
    listen(Events.Order.Finalized, async ({ order, sendEmail }) => {
        if (sendEmail === false) return;
        await NotificationHelper.orderCreatedNotification(await order.rel('user'), order);
    });
    listen(Events.Auth.Login, async ({ user }) => {
        const req = await getRequestInfo();
        const ip = req.ip;
        const existing = ip ? await user.relation('authenticationLogs').where('ip_address', ip).first() : null;
        if (!existing) {
            // If the log for this IP does not exist, create a new log
            await UserAuthenticationLog.create({ user_id: user.id, ip_address: ip });
            await NotificationHelper.loginDetectedNotification(user, {
                ip,
                device: formatDevice(req.userAgent ?? ''),
                time: Carbon.now().format('Y-m-d H:i:s'),
            });
        } else {
            // If it exists, update the last used timestamp
            (existing as any).last_used_at = Carbon.now();
            await existing.save();
        }
    });
    listen(Events.ServiceCancellation.Created, async ({ cancellation }) => {
        const service = (await cancellation.rel('service'))!;
        await NotificationHelper.serviceCancellationReceivedNotification(await service.rel('user'), cancellation);
    });

    /* TicketMessageCreatedListener */
    listen(Events.TicketMessage.Created, async ({ ticketMessage }) => {
        const ticket = (await ticketMessage.rel('ticket'))!;
        const owner = await ticket.rel('user');
        const author = await ticketMessage.rel('user');
        if (owner.id !== author.id) {
            await ticket.update({ status: 'replied' });
            await NotificationHelper.ticketMessageNotification(owner, ticketMessage);
        } else {
            await ticket.update({ status: 'open' });
        }
    });

    /* UserAuthListener: carry the cart across login / logout */
    listen(Events.Auth.Login, onLoginCart);
    listen('Illuminate\\Auth\\Events\\Logout', onLogoutCart);
}

/** Laravel pads and templates the invoice / credit note number: `INV-{year}-{number}` */
export function formatInvoiceNumber(number: number, prefix: 'invoice' | 'credit_note' = 'invoice'): string {
    const padded = strPad(number, Number(setting(`${prefix}_number_padding`, 1)), '0', 'left');
    const now = Carbon.now();
    return String(setting(`${prefix}_number_format`, '{number}'))
        .replaceAll('{number}', padded)
        .replaceAll('{year}', now.format('Y'))
        .replaceAll('{month}', now.format('m'))
        .replaceAll('{day}', now.format('d'));
}
