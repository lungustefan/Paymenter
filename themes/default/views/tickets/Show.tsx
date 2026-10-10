import { Ri } from '@/components/icons/Ri';
import { setting } from '@/server/config';
import { route } from '@/server/routes';
import { markdown } from '@/server/markdown';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { ucfirst } from '@/server/lib/php';
import type { Ticket } from '@/server/models/Ticket';
import type { TicketMessage } from '@/server/models/TicketMessage';
import { cn } from '../../components/cn';
import { AutoRefresh, ReplyForm, ScrollToLast } from './TicketClient';

const detail = 'font-semibold flex md:flex-col justify-between bg-primary-800 p-2 px-4 rounded-md';

/** Port of views/tickets/show.blade.php */
export default async function Show({ ticket }: { ticket: Ticket }) {
    const tr = makeTranslator(await getLocale());
    const t = tr.t;
    const messages = await ticket.relation<TicketMessage>('messages').with('user').get();
    const rows = await Promise.all(
        messages.map(async (message) => ({
            message,
            user: (await message.rel('user'))!,
            attachments: await message.rel('attachments'),
        })),
    );
    const canClose = !setting('ticket_client_closing_disabled', false) && ticket.status !== 'closed';

    /* eslint-disable @next/next/no-img-element */
    return (
        <div className="container mt-14">
            <div className="bg-primary-800 p-6 rounded-lg mt-2">
                <h1 className="text-2xl font-semibold">
                    Ticket #{ticket.id} - {ticket.subject}
                </h1>

                <div className="md:grid grid-cols-4 flex flex-col gap-4">
                    <div className="md:col-span-3">
                        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-4">
                            <AutoRefresh seconds={10} />
                            {rows.map(({ message, user, attachments }, index) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        'bg-background-secondary hover:bg-background-secondary/80 border border-neutral p-4 rounded-lg w-full max-w-[80%] ',
                                        message.user_id === ticket.user_id ? 'ml-auto' : 'mr-auto',
                                    )}
                                >
                                    {index === rows.length - 1 && <ScrollToLast />}
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <img src={user.avatarUrl()} className="size-8 rounded-full border border-neutral bg-background" alt={`${user.displayName()} avatar`} />
                                            <div className="flex flex-col">
                                                <h2 className="text-lg font-semibold">{user.displayName()}</h2>
                                                <p className="text-sm text-gray-500">{message.created_at?.diffForHumans(null, tr.locale)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className="mt-2 prose dark:prose-invert break-words max-w-full"
                                        dangerouslySetInnerHTML={{ __html: markdown(message.message as string, { html_input: 'escape', allow_unsafe_links: false, soft_break: '<br>' }) }}
                                    />
                                    <div className="flex flex-wrap gap-x-2">
                                        {attachments.map((attachment) => {
                                            const url = route('tickets.attachments.show', attachment, false);
                                            return (
                                                <div className="mt-2" key={attachment.id}>
                                                    <a href={url} className="text-sm rounded-md bg-gray-100 flex items-center dark:bg-gray-800 p-1 w-fit">
                                                        {attachment.canPreview() ? (
                                                            <img src={url} alt={attachment.filename as string} className="max-w-full" />
                                                        ) : (
                                                            <>
                                                                <Ri name="attachment-2" className="inline-block mr-1 size-4" />
                                                                {attachment.filename}
                                                            </>
                                                        )}
                                                    </a>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <ReplyForm ticketId={ticket.id as number} canClose={canClose} />
                    </div>

                    <div className="md:order-last order-first w-full col-span-3 sm:col-auto">
                        {/* Show subject and status */}
                        <div className="flex flex-col w-full col-span-1">
                            <h2 className="text-2xl font-semibold bg-primary-800 p-2 px-4 rounded-md mb-2">{t('ticket.ticket_details')}</h2>
                            <div className={`${detail} gap-2`}>
                                <h4 className="h-fit">{t('ticket.subject')}:</h4> {ticket.subject}
                            </div>
                            <div className={detail}>
                                <h4>{t('ticket.status')}:</h4> {ucfirst(ticket.status as string)}
                            </div>
                            <div className={detail}>
                                <h4>{t('ticket.priority')}:</h4> {ucfirst(ticket.priority as string)}
                            </div>
                            <div className={detail}>
                                <h4>{t('ticket.created_at')}:</h4> {ticket.created_at?.diffForHumans(null, tr.locale)}
                            </div>
                            {ticket.department && (
                                <div className={detail}>
                                    <h4>{t('ticket.department')}:</h4>
                                    {ticket.department}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
