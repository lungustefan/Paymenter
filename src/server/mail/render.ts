import { renderBlade } from '@/server/blade';
import { markdown } from '@/server/markdown';
import { config, setting } from '@/server/config';
import type { NotificationTemplate } from '@/server/models/NotificationTemplate';

/**
 * Rendering of the HTML mail:
 *   components.mail.base  -> layout( Blade(template body) )
 *   components.mail.layout -> Blade(mail_header) + Markdown(body) + Blade(mail_footer)
 */

export async function renderLayout(innerBody: string, data: Record<string, any>): Promise<string> {
    const header = await renderBlade(setting<string | null>('mail_header', null), data);
    const footer = await renderBlade(setting<string | null>('mail_footer', null), data);
    // `$slot` is trimmed by Blade components
    return `${header}\n${markdown(innerBody.trim())}\n${footer}`;
}

export interface MailPayload {
    subject: string;
    html: string;
}

/** Port of App\Mail\Mail: renders subject and html for a notification template. */
export async function renderTemplateMail(template: NotificationTemplate, data: Record<string, any>): Promise<MailPayload> {
    const vars = { ...data, body: template.body };
    const subject = await renderBlade(template.subject, vars);
    // `$data` is available inside the layout and the template: it is the full data array
    const scope = { ...vars, data: vars, emailTemplate: template };
    const rendered = await renderBlade(template.body, scope);
    return { subject, html: await renderLayout(rendered, scope) };
}

/** Port of App\Mail\SystemMail. */
export async function renderSystemMail(subject: string, body: string): Promise<MailPayload> {
    const appName = config('app.name');
    const content = `<p>Hi,</p>\n${body}\n<small>This is an automated message sent from ${appName}</small>`;
    let rendered: string;
    try {
        rendered = await renderBlade(content);
    } catch {
        // messages containing stray template syntax are shown verbatim
        rendered = content;
    }
    return { subject, html: await renderLayout(rendered, {}) };
}
