import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '@/server/config';
import { registerJob } from '@/server/queue';
import { EmailLog } from '@/server/models/EmailLog';
import { Carbon } from '@/server/lib/carbon';

/** Mail transport configured from the `mail.*` settings (host, port, encryption, credentials). */
export function createTransport() {
    const smtp = config<Record<string, any>>('mail.mailers.smtp', {});
    const port = Number(smtp.port ?? 25);
    const encryption = smtp.encryption as string | null;
    return nodemailer.createTransport({
        host: smtp.host,
        port,
        secure: encryption === 'ssl' || port === 465,
        auth: smtp.username ? { user: smtp.username, pass: smtp.password ?? '' } : undefined,
        tls: { rejectUnauthorized: false },
    } as any);
}

export interface SendMailPayload {
    email_log_id: number;
    to: string;
    cc?: string[] | null;
    bcc?: string[] | null;
    replyTo?: string | null;
    headers?: Record<string, string>;
    attachments?: Array<{ path: string; name: string; options?: { mime?: string } }>;
}

/** Deliver a queued email; updates the corresponding `email_logs` row (like the Queue::after/failing hooks). */
registerJob<SendMailPayload>('mail.send', {
    tries: 1,
    timeout: 60,
    async handle(p, ctx) {
        const log = await EmailLog.find<EmailLog>(p.email_log_id);
        if (!log) return;
        try {
            const transport = createTransport();
            await transport.sendMail({
                from: { address: config('mail.from.address'), name: config('mail.from.name') },
                to: p.to,
                cc: p.cc?.length ? p.cc : undefined,
                bcc: p.bcc?.length ? p.bcc : undefined,
                replyTo: p.replyTo ?? undefined,
                subject: log.subject,
                html: log.body,
                headers: p.headers,
                attachments: (p.attachments ?? [])
                    .map((a) => ({ filename: a.name, path: path.join(process.cwd(), 'storage', 'app', a.path), contentType: a.options?.mime }))
                    .filter((a) => fs.existsSync(a.path)),
            });
            await EmailLog.query().where('id', log.id).update({ sent_at: Carbon.now(), status: 'sent' });
        } catch (e: any) {
            await EmailLog.query().where('id', log.id).update({ status: 'failed', error: String(e?.message ?? e), job_uuid: ctx.uuid });
            throw e;
        }
    },
});
