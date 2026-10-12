import { describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { createTicket, createTicketMessage, createUser } from '../helpers/factories';
import { Ticket } from '@/server/models/Ticket';

describe('TicketStatusUpdate', () => {
    useDatabase();

    it('updates the ticket status on a new message from another user', async () => {
        const user = await createUser();
        const ticket = await createTicket({ user_id: user.id, status: 'open' });
        await createTicketMessage({ ticket_id: ticket.id, user_id: user.id });

        const status = async () => (await Ticket.find<Ticket>(ticket.id))!.status;
        expect(await status()).toBe('open');

        // Simulate a new message created by a different user
        const anotherUser = await createUser();
        await createTicketMessage({ ticket_id: ticket.id, user_id: anotherUser.id });

        // Assert that the ticket status is updated to 'replied'
        expect(await status()).toBe('replied');
    });
});
