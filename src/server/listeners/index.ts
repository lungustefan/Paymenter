import { listen } from '@/server/events';
import { Events } from '@/server/event-defs';
import { dispatchJob } from '@/server/queue';
import { transaction } from '@/server/orm';
import { Carbon } from '@/server/lib/carbon';
import { config, setting } from '@/server/config';
import { strPad } from '@/server/lib/php';
import { InvoiceTransactionStatus } from '@/server/enums';
import { Settings } from '@/server/classes/Settings';
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
        if (!setting('invoice_snapshot', true)) return;
        // Only create snapshot if it doesn't already exist
        if (await invoice.rel('snapshot')) return;
        const user = await invoice.rel('user');
        const data: Record<string, any> = {
            name: user.displayName(),
            properties: await invoice.userProperties(),
            bill_to: setting('bill_to_text', setting('company_name')),
        };
        const tax = await Settings.tax(user);
        if (tax) {
            data.tax_name = tax.name;
            data.tax_rate = tax.rate;
            data.tax_country = tax.country;
        }
        await invoice.relation('snapshot').create(data);
    });

    /* InvoiceNumberListener */
    const setInvoiceNumber = async (invoice: any) => {
        const formatted = await transaction(async () => {
            const row = await Setting.query().where('key', 'invoice_number').lockForUpdate().first();
            const number = Number.parseInt(String(row?.value ?? 0), 10) + 1;
            await Setting.updateOrCreate({ key: 'invoice_number' }, { value: number });
            return formatInvoiceNumber(number);
        });
        invoice.number = formatted;
    };
    listen(Events.Invoice.Creating, async ({ invoice }) => {
        if (!setting('invoice_proforma', false)) await setInvoiceNumber(invoice);
    });
    listen(Events.Invoice.Updating, async ({ invoice }) => {
        if (invoice.isDirty('status') && invoice.status === 'paid' && !invoice.number) await setInvoiceNumber(invoice);
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
        await NotificationHelper.invoiceCreatedNotification(await invoice.rel('user'), invoice);
    });
    listen(Events.Invoice.Paid, async ({ invoice }) => {
        await NotificationHelper.invoicePaidNotification(await invoice.rel('user'), invoice);
    });
    const failed = async ({ invoiceTransaction }: { invoiceTransaction: any }) => {
        if (invoiceTransaction.status === InvoiceTransactionStatus.Failed) {
            const invoice = (await invoiceTransaction.rel('invoice'))!;
            await NotificationHelper.invoicePaymentFailedNotification(await invoice.rel('user'), invoice);
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

/** Laravel pads and templates the invoice number: `INV-{year}-{number}` */
export function formatInvoiceNumber(number: number): string {
    const padded = strPad(number, Number(setting('invoice_number_padding', 1)), '0', 'left');
    const now = Carbon.now();
    return String(setting('invoice_number_format', '{number}'))
        .replaceAll('{number}', padded)
        .replaceAll('{year}', now.format('Y'))
        .replaceAll('{month}', now.format('m'))
        .replaceAll('{day}', now.format('d'));
}
