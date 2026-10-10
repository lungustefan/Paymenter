import { Action } from './Action';
import { Notification } from '../Notification';
import { Schema, TextInput } from '../forms';
import { hasPermission } from '@/server/policies';
import { config } from '@/server/config';
import { Settings } from '@/server/classes/Settings';
import { createTransport } from '@/server/mail/transport';
import { renderSystemMail } from '@/server/mail/render';
import { markdown } from '@/server/markdown';

const authorize = async (user: any) => {
    if (!(await hasPermission(user, 'admin.settings.update'))) throw new Error('This action is unauthorized.');
};

/** App\Admin\Actions\ResetColorsAction */
export function resetColorsAction() {
    return Action.make('resetColors')
        .label('Reset Colors')
        .color('danger')
        .requiresConfirmation()
        .action(async ({ user, set }: any) => {
            await authorize(user);
            for (const settings of Object.values(Settings.settings())) for (const s of settings as any[]) if ((s.type ?? '') === 'color') set(s.name, s.default ?? '');
            await Notification.make().title('Colors has been reset!').success().send();
        });
}

const PATTERNS: Array<[RegExp, string]> = [
    [/auth(entication)? failed|could not authenticate|\b535\b/i, 'Authentication failed. Please check your Mail Username and Password.'],
    [/connection timed out|ETIMEDOUT/i, 'Connection to mail server timed out. Check your Mail Host and Port settings.'],
    [/connection refused|ECONNREFUSED/i, 'Connection to mail server was refused. Verify your Mail Host and Port are correct.'],
    [/could not connect to host/i, 'Could not connect to mail server. Check your Mail Host and network connection.'],
    [/ssl.*handshake|stream_socket_enable_crypto|certificate/i, 'SSL/TLS error. Try changing Mail Encryption (TLS/SSL) or check certificates.'],
    [/STARTTLS/i, 'Mail server requires STARTTLS. Enable TLS encryption.'],
    [/getaddrinfo|name or service not known|temporary failure in name resolution|ENOTFOUND/i, 'Could not resolve mail server address. Check your Mail Host setting.'],
    [/invalid address|\b550\b/i, 'Invalid email address. Check the recipient or sender address.'],
];

function mailErrorHint(e: any): string {
    const message = String(e?.message ?? e);
    for (const [pattern, friendly] of PATTERNS) if (pattern.test(message)) return `${friendly}\n\nTechnical details: ${message}`;
    return `Mail sending failed. Please check your mail configuration settings.\n\nError: ${message}`;
}

/** App\Admin\Actions\SendTestEmailAction */
export function sendTestEmailAction() {
    return Action.make('sendTestEmail')
        .label('Send Test Email')
        .color('info')
        .requiresConfirmation()
        .modalHeading('Send Test Email')
        .modalDescription('Send a test email to verify your mail configuration.')
        .form(() => Schema.make().components([TextInput.make('recipient').label('Recipient Email').email().required().default(({ user }: any) => user?.email)]))
        .action(async ({ data, user }: any) => {
            await authorize(user);
            try {
                const mail = await renderSystemMail(`Test Email from ${config('app.name')}`, '<p>This is a test email to verify your mail configuration is working correctly.</p>');
                await createTransport().sendMail({ from: { address: config('mail.from.address'), name: config('mail.from.name') }, to: data.recipient, subject: mail.subject, html: mail.html });
                await Notification.make().title(`Test email sent to ${data.recipient}`).success().send();
            } catch (e) {
                await Notification.make().title('Failed to send test email').body(markdown(mailErrorHint(e))).danger().persistent().send();
            }
        });
}

export const settingActions: Record<string, () => Action> = { 'reset-colors': resetColorsAction, 'send-test-email': sendTestEmailAction };
