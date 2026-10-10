'use server';

import { notFound } from 'next/navigation';
import { action, flash, type ActionResult } from '@/server/action';
import { disabledIf, initRequest, requireUser } from '@/server/page';
import { validate } from '@/server/validation';
import { RateLimiter } from '@/server/cache';
import { setting } from '@/server/config';
import { Ticket } from '@/server/models/Ticket';
import { storeAttachments } from '@/server/services/tickets/uploads';
import { route, relativeUrl } from '@/server/routes';

/** Actions of Livewire\Tickets\{Create,Show} */

function filesOf(fd: FormData): File[] {
    return fd.getAll('attachments').filter((f): f is File => typeof f !== 'string' && f.size > 0);
}

export async function createTicketAction(fd: FormData): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        await disabledIf('tickets_disabled');
        const user = await requireUser({ verified: true });

        const departments = Object.values((setting<any>('ticket_departments', []) ?? []) as Record<string, string>);
        const attachments = filesOf(fd);
        const input = {
            department: String(fd.get('department') ?? ''),
            service: fd.get('service') ? Number(fd.get('service')) : null,
            subject: String(fd.get('subject') ?? ''),
            message: String(fd.get('message') ?? ''),
            priority: String(fd.get('priority') ?? ''),
            attachments,
        };

        await validate(
            input,
            {
                department: departments.length > 0 ? `required|in:${departments.join(',')}` : '',
                service: `nullable|exists:services,id,user_id,${user.id}`,
                subject: 'required|string',
                message: 'required|string',
                priority: 'required|in:low,medium,high',
                'attachments.*': 'file|max:10240',
            },
            { locale },
        );

        const rateLimitKey = `create-ticket:${user.id}`;
        if (await RateLimiter.tooManyAttempts(rateLimitKey, 1)) return { ok: false, notify: { message: 'Too many ticket creation attempts. Please try again in 30 seconds.', type: 'error' } };
        await RateLimiter.hit(rateLimitKey, 30);

        const ticket = await Ticket.create({
            user_id: user.id,
            department: input.department,
            service_id: input.service,
            subject: input.subject,
            priority: input.priority,
        });
        const message = await ticket.relation('messages').create({ user_id: user.id, message: input.message });
        await storeAttachments(message as any, attachments);

        await flash('Message sent successfully', 'success');
        return { ok: true, redirect: relativeUrl(route('tickets.show', ticket)) };
    });
}

async function ownedTicket(id: number) {
    const user = await requireUser({ verified: true });
    const ticket = await Ticket.find<Ticket>(id);
    if (!ticket || ticket.user_id !== user.id) notFound();
    return { user, ticket };
}

export async function replyTicketAction(ticketId: number, fd: FormData): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        await disabledIf('tickets_disabled');
        const { user, ticket } = await ownedTicket(ticketId);
        const attachments = filesOf(fd);
        const message = String(fd.get('message') ?? '');

        await validate({ message, attachments }, { message: 'required|string', 'attachments.*': 'file|max:10240' }, { locale });

        const rateLimitKey = `ticket-message:${ticket.id}:${user.id}`;
        if (await RateLimiter.tooManyAttempts(rateLimitKey, 3)) return { ok: false, notify: { message: 'Too many message attempts. Please try again in 10 seconds.', type: 'error' } };
        await RateLimiter.hit(rateLimitKey, 10);

        const created = await ticket.relation('messages').create({ user_id: user.id, message });
        await storeAttachments(created as any, attachments);

        return { ok: true, notify: { message: 'Message sent successfully', type: 'success' }, redirect: 'refresh', data: { saved: true } };
    });
}

export async function closeTicketAction(ticketId: number): Promise<ActionResult> {
    return action(async () => {
        const { tr } = await initRequest();
        await disabledIf('tickets_disabled');
        const { ticket } = await ownedTicket(ticketId);
        if (setting('ticket_client_closing_disabled', false)) throw new Error('Closing tickets is disabled.');
        await ticket.update({ status: 'closed' });
        return { ok: true, notify: { message: tr.t('ticket.close_ticket_success'), type: 'success' }, redirect: 'refresh' };
    });
}
