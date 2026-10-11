import fs from 'node:fs';
import path from 'node:path';
import { renderBlade } from '@/server/blade';
import { config, setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { signUrl } from '@/server/lib/crypto';
import { sha1 } from '@/server/lib/crypto';
import { dispatchJob } from '@/server/queue';
import { PDF } from '@/server/classes/PDF';
import { renderSystemMail, renderTemplateMail } from '@/server/mail/render';
import { baseUrl, route } from '@/server/routes';
import { EmailLog } from '@/server/models/EmailLog';
import { Notification } from '@/server/models/Notification';
import { NotificationTemplate } from '@/server/models/NotificationTemplate';
import type { Invoice } from '@/server/models/Invoice';
import type { Order } from '@/server/models/Order';
import type { Service } from '@/server/models/Service';
import type { ServiceCancellation } from '@/server/models/ServiceCancellation';
import type { TicketMessage } from '@/server/models/TicketMessage';
import type { User } from '@/server/models/User';
import type { SendMailPayload } from '@/server/mail/transport';
import '@/server/mail/transport';

interface Attachment {
    path: string;
    name: string;
    options?: { mime?: string };
}

/** Port of App\Helpers\NotificationHelper. */
export class NotificationHelper {
    static async sendEmailNotification(template: NotificationTemplate, data: Record<string, any>, user: User, attachments: Attachment[] = []) {
        const mail = await renderTemplateMail(template, data);
        const log = await EmailLog.create({ user_id: user.id, subject: mail.subject, to: user.email, body: mail.html });

        const payload: SendMailPayload = {
            email_log_id: log.id,
            to: user.email,
            cc: (template.cc as string[] | null) ?? null,
            bcc: (template.bcc as string[] | null) ?? null,
            attachments,
        };

        // Threading headers for ticket replies (port of TicketReplyEmailListener)
        if (template.key === 'new_ticket_message' && data.ticketMessage) {
            const host = new URL(baseUrl()).hostname;
            const ticketMessage = data.ticketMessage as TicketMessage;
            const ticket = (await ticketMessage.rel('ticket'))!;
            // Second last, because last is the current message
            const previousReply = await ticket
                .relation<TicketMessage>('messages')
                .where('user_id', '!=', ticket.user_id)
                .orderBy('id', 'desc')
                .skip(1)
                .first();
            payload.headers = { 'Message-ID': `${ticketMessage.id}@${host}`, References: `${ticket.id}@${host}` };
            if (previousReply) payload.headers['In-Reply-To'] = `${previousReply.id}@${host}`;
            if (setting('ticket_mail_piping', false)) payload.replyTo = setting('ticket_mail_email');
        }

        await dispatchJob('mail.send', payload);
    }

    static async sendSystemEmailNotification(subject: string, body: string, attachments: Attachment[] = [], email: string | null = null) {
        email ??= setting<string | null>('system_email_address');
        if (!email || setting('mail_disable')) return;

        const mail = await renderSystemMail(subject, body);
        const log = await EmailLog.create({ subject: mail.subject, to: email, body: mail.html });
        await dispatchJob('mail.send', { email_log_id: log.id, to: email, attachments } satisfies SendMailPayload);
    }

    static async sendInAppNotification(template: NotificationTemplate, data: Record<string, any>, user: User, showInApp = true, showAsPush = true) {
        await Notification.create({
            user_id: user.id,
            title: await renderBlade(template.in_app_title, data),
            body: await renderBlade(template.in_app_body, data),
            url: template.in_app_url ? await renderBlade(template.in_app_url, data) : null,
            show_in_app: showInApp,
            show_as_push: showAsPush,
        });
    }

    static async sendNotification(key: string, data: Record<string, any>, user: User, attachments: Attachment[] = [], showInApp = true, showAsPush = true) {
        const template = await NotificationTemplate.query().where('key', key).first();
        if (!template || !template.enabled) return;

        const preference = await user.relation('notificationsPreferences').where('notification_template_id', template.id).first();

        if (template.isEnabledForPreference(preference as any, 'mail') && !setting('mail_disable')) {
            await this.sendEmailNotification(template, data, user, attachments);
        }
        if (template.isEnabledForPreference(preference as any, 'app')) {
            await this.sendInAppNotification(template, data, user, showInApp, showAsPush);
        }
    }

    static loginDetectedNotification(user: User, data: Record<string, any> = {}) {
        return this.sendNotification('new_login_detected', data, user);
    }

    static async invoiceNotification(user: User, invoice: Invoice, key = 'new_invoice_created') {
        const items = await invoice.rel('items');
        const data: Record<string, any> = {
            invoice,
            items,
            total: await invoice.formattedTotal(),
            has_subscription: (
                await Promise.all(
                    items.map(async (item) => {
                        if (item.reference_type !== 'App\\Models\\Service') return false;
                        const ref = (await item.rel('reference')) as Service | null;
                        return !!ref?.subscription_id;
                    }),
                )
            ).some(Boolean),
        };

        // Generate the invoice PDF
        const pdf = await PDF.generateInvoice(invoice);
        const dir = path.join(process.cwd(), 'storage', 'app', 'invoices');
        fs.mkdirSync(dir, { recursive: true });
        const file = `${invoice.number ?? invoice.id}.pdf`;
        await pdf.save(path.join(dir, file));

        await this.sendNotification(key, data, user, [{ path: `invoices/${file}`, name: 'invoice.pdf' }]);
    }

    static invoiceCreatedNotification(user: User, invoice: Invoice) {
        return this.invoiceNotification(user, invoice, 'new_invoice_created');
    }
    static invoicePaidNotification(user: User, invoice: Invoice) {
        return this.invoiceNotification(user, invoice, 'invoice_paid');
    }
    static invoicePaymentFailedNotification(user: User, invoice: Invoice) {
        return this.invoiceNotification(user, invoice, 'invoice_payment_failed');
    }

    static async orderCreatedNotification(user: User, order: Order) {
        await this.sendNotification('new_order_created', { order, items: await order.rel('services'), total: await order.formattedTotal() }, user);
    }

    static serverCreatedNotification(user: User, service: Service, data: Record<string, any> = {}) {
        return this.sendNotification('new_server_created', { ...data, service }, user);
    }
    static serverSuspendedNotification(user: User, service: Service, data: Record<string, any> = {}) {
        return this.sendNotification('server_suspended', { ...data, service }, user);
    }
    static serverTerminatedNotification(user: User, service: Service, data: Record<string, any> = {}) {
        return this.sendNotification('server_terminated', { ...data, service }, user);
    }
    static ticketMessageNotification(user: User, ticketMessage: TicketMessage, data: Record<string, any> = {}) {
        return this.sendNotification('new_ticket_message', { ...data, ticketMessage }, user);
    }

    static async emailVerificationNotification(user: User, data: Record<string, any> = {}) {
        const expire = Number(config('auth.verification.expire', 60));
        const url = signUrl(
            route('verification.verify', { id: user.id, hash: sha1(user.email) }),
            {},
            Carbon.now().addMinutes(expire).toDate(),
        );
        await this.sendNotification('email_verification', { ...data, user, url }, user);
    }

    static passwordResetNotification(user: User, data: Record<string, any> = {}) {
        return this.sendNotification('password_reset', { ...data, user }, user);
    }

    static async serviceCancellationReceivedNotification(user: User, cancellation: ServiceCancellation, data: Record<string, any> = {}) {
        await this.sendNotification('service_cancellation_received', { ...data, cancellation, service: await cancellation.rel('service') }, user);
    }
}
