import { describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { configSettings, createProduct, createService, createTicket, createTicketMessage, createUser } from '../helpers/factories';
import { cronJob } from '@/server/commands/cron-job';
import { currentDb } from '@/server/orm';
import { jobs } from '@/server/db/schema';
import { Carbon } from '@/server/lib/carbon';
import { Invoice } from '@/server/models/Invoice';
import { Product } from '@/server/models/Product';
import { Service } from '@/server/models/Service';
import { Ticket } from '@/server/models/Ticket';

describe('Cronjob', () => {
    useDatabase();

    const runCron = () => cronJob(() => {});
    const dt = (c: Carbon | null) => c?.toDateTimeString();
    const reload = async (service: Service) => (await Service.find<Service>(service.id))!;

    /** `Queue::assertPushed(...)`: queued jobs are rows of the `jobs` table */
    async function pushedJobs(name: string) {
        const rows = (await currentDb().select().from(jobs)) as { payload: string }[];
        return rows.map((r) => JSON.parse(r.payload)).filter((p) => p.job === name);
    }

    /** the due date the invoice must get: the service's expires_at before the cron job ran (the `date` cast makes it the start of the day) */
    const dueDateOf = async (service: Service) => dt((await reload(service)).expires_at)!;

    async function findInvoice(userId: number, dueAt: string, status = 'pending') {
        return Invoice.query().where('user_id', userId).where('status', status).where('due_at', dueAt).where('currency_code', 'USD').first();
    }

    it('creates invoices if the due date is reached', async () => {
        const user = await createUser();
        // number of days before the due date to send an invoice
        configSettings({ cronjob_invoice: 7 });
        const product = await createProduct();

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'active',
            expires_at: Carbon.now().addDays(2).addHours(-1),
            price: 10.0,
        });

        const dueAt = await dueDateOf(service);

        await runCron();

        expect(await findInvoice(user.id, dueAt)).not.toBeNull();
    });

    it('pays invoices with credits if available', async () => {
        const user = await createUser();
        await user.relation('credits').create({ currency_code: 'USD', amount: 10.0 });
        configSettings({ cronjob_invoice: 7 });
        const product = await createProduct();

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'active',
            expires_at: Carbon.now().addDays(2).addHours(-1),
            price: 10.0,
        });

        const dueAt = await dueDateOf(service);

        await runCron();

        expect(await findInvoice(user.id, dueAt, 'paid')).not.toBeNull();
    });

    it('renews services if the price is zero', async () => {
        const user = await createUser();
        configSettings({ cronjob_invoice: 7 });
        const product = await createProduct();

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'active',
            expires_at: Carbon.now().addDays(2).addHours(-1),
            price: 0.0,
        });

        const before = await reload(service);
        await runCron();

        const renewed = await reload(service);
        expect(renewed.status).toBe('active');
        expect(dt(renewed.expires_at)).toBe(dt(await before.calculateNextDueDate()));
    });

    it('cancels services that are not paid within the configured days', async () => {
        const user = await createUser();
        configSettings({ cronjob_order_cancel: 7 });
        const product = await createProduct();

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'pending',
            price: 10.0,
            created_at: Carbon.now().subDays(8),
        });

        await runCron();

        expect((await reload(service)).status).toBe('cancelled');
    });

    it('suspends services if the due date has passed', async () => {
        const user = await createUser();
        const product = await createProduct();
        configSettings({ cronjob_order_suspend: 2 });

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'active',
            expires_at: Carbon.now().subDays(3),
            price: 10.0,
        });

        const dueAt = await dueDateOf(service);

        await runCron();

        // an invoice was created
        expect(await findInvoice(user.id, dueAt)).not.toBeNull();

        // the suspend job was queued
        const pushed = await pushedJobs('server.suspend');
        expect(pushed.some((j) => j.data.service.id === service.id)).toBe(true);

        expect((await reload(service)).status).toBe('suspended');
    });

    it('terminates orders if the due date is overdue', async () => {
        const user = await createUser();
        configSettings({ cronjob_order_terminate: 14 });
        const product = await createProduct();

        const service = await createService({
            user_id: user.id,
            plan_id: product.plan.id,
            product_id: product.product.id,
            status: 'active',
            expires_at: Carbon.now(),
            price: 10.0,
        });

        const dueAt = await dueDateOf(service);

        await runCron();

        // Now it should have generated an invoice
        expect(await findInvoice(user.id, dueAt)).not.toBeNull();

        // Update due date to be overdue
        service.expires_at = Carbon.now().subDays(15);
        await service.save();

        await runCron();

        expect((await reload(service)).status).toBe(Service.STATUS_CANCELLED);

        const pushed = await pushedJobs('server.terminate');
        expect(pushed.some((j) => j.data.service.id === service.id)).toBe(true);

        expect(await Invoice.query().where('user_id', user.id).where('status', 'cancelled').where('currency_code', 'USD').exists()).toBe(true);
    });

    it('closes tickets with no response for x days', async () => {
        const user = await createUser();
        configSettings({ cronjob_close_ticket: 7 });

        const ticket = await createTicket({ user_id: user.id, status: 'open' });
        expect((await Ticket.find<Ticket>(ticket.id))!.status).toBe('open');

        const differentUser = await createUser();
        await createTicketMessage({
            ticket_id: ticket.id,
            user_id: differentUser.id,
            message: 'This is a test message.',
            created_at: Carbon.now().subDays(8),
        });

        await runCron();

        expect((await Ticket.find<Ticket>(ticket.id))!.status).toBe('closed');
    });

    describe('stock on termination', () => {
        const terminate = async (productAttrs: Record<string, any>, serviceAttrs: Record<string, any> = {}) => {
            const product = await createProduct(productAttrs);
            const user = await createUser();
            const service = await createService({
                product_id: product.product.id,
                status: 'suspended',
                expires_at: Carbon.now().subDays(15),
                user_id: user.id,
                price: 10.0,
                ...serviceAttrs,
            });
            await runCron();
            expect((await reload(service)).status).toBe(Service.STATUS_CANCELLED);
            return { product, service };
        };
        const stockOf = async (product: Product) => (await Product.find<Product>(product.id))!.stock;

        it('increments the product stock', async () => {
            const { product, service } = await terminate({ stock: 10 }, { quantity: 2 });
            expect(await stockOf(product.product)).toBe(10 + Number(service.quantity));
        });

        it('does not increment the stock if it is null', async () => {
            const { product } = await terminate({ stock: null });
            expect(await stockOf(product.product)).toBeNull();
        });

        it('increments the stock if it is zero', async () => {
            const { product } = await terminate({ stock: 0 });
            expect(await stockOf(product.product)).toBe(1);
        });
    });
});
