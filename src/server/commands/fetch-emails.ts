import fs from 'node:fs';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import EmailReplyParser from 'email-reply-parser';
import { setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { ulid } from '@/server/lib/ids';
import { setAuditConsole } from '@/server/orm/audit';
import { TicketMailLog } from '@/server/models/TicketMailLog';
import { TicketMessage } from '@/server/models/TicketMessage';

/** Port of `app:fetch-emails`: import ticket replies from an IMAP mailbox. */
export async function fetchEmails(info: (m: string) => void = console.log) {
    if (!setting('ticket_mail_piping', false)) {
        info('Email piping is not enabled. Skipping email fetch.');
        return;
    }
    setAuditConsole(true);

    const client = new ImapFlow({
        host: setting('ticket_mail_host'),
        port: Number(setting('ticket_mail_port', 993)),
        secure: Number(setting('ticket_mail_port', 993)) === 993,
        auth: { user: setting('ticket_mail_email'), pass: setting('ticket_mail_password') },
        logger: false,
    });

    const failed = (messageId: string, subject: string, from: string, to: string, body: string) =>
        TicketMailLog.create({ message_id: messageId, subject, from, to, body, status: 'unprocessed' });

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const since = Carbon.now().subDays(1).toDate();
            for await (const msg of client.fetch({ since }, { source: true })) {
                const email = await simpleParser(msg.source as Buffer);
                const messageId = email.messageId ?? '';
                if (await TicketMailLog.query().where('message_id', messageId).exists()) continue;

                let rawBody = email.text ?? '';
                if (!rawBody && email.html) {
                    // no text body but an HTML body: strip the tags
                    rawBody = String(email.html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                }
                const body = new EmailReplyParser().read(rawBody).getVisibleText();
                const from = email.from?.value?.[0]?.address ?? '';
                const to = (Array.isArray(email.to) ? email.to[0] : email.to)?.value?.[0]?.address ?? '';
                const subject = email.subject ?? '';

                // Check headers to see if this email is a reply
                const inReplyTo = Array.isArray(email.inReplyTo) ? email.inReplyTo[0] : email.inReplyTo;
                if (!inReplyTo) {
                    await failed(messageId, subject, from, to, body);
                    continue;
                }
                // Validate if in reply to another ticket (<ticket message id>@hostname)
                const m = /^<?(\d+)@/.exec(inReplyTo);
                if (!m) {
                    await failed(messageId, subject, from, to, body);
                    continue;
                }
                const ticketMessage = await TicketMessage.find<TicketMessage>(Number(m[1]));
                if (!ticketMessage) {
                    await failed(messageId, subject, from, to, body);
                    continue;
                }
                const ticket = (await ticketMessage.rel('ticket'))!;
                const owner = await ticket.rel('user');
                // Check if from email matches ticket's email
                if (from !== owner.email) {
                    await failed(messageId, subject, from, to, body);
                    continue;
                }

                const log = await TicketMailLog.create({ message_id: messageId, subject, from, to, body, status: 'processed' });
                const message = await ticket.relation<TicketMessage>('messages').create({ message: body, user_id: ticket.user_id, ticket_mail_log_id: log.id });

                for (const attachment of email.attachments ?? []) {
                    const ext = path.extname(attachment.filename ?? '').replace('.', '');
                    const rel = `tickets/uploads/${ulid()}${ext ? `.${ext}` : ''}`;
                    const abs = path.join(process.cwd(), 'storage', 'app', rel);
                    fs.mkdirSync(path.dirname(abs), { recursive: true });
                    fs.writeFileSync(abs, attachment.content);
                    await message.relation('attachments').create({
                        path: rel,
                        filename: attachment.filename ?? 'attachment',
                        mime_type: attachment.contentType,
                        filesize: attachment.size,
                    });
                }
            }
        } finally {
            lock.release();
        }
    } catch (e: any) {
        console.error('FetchEmails failed:', e?.message ?? e);
    } finally {
        await client.logout().catch(() => {});
    }
}
