import { describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { createInvoice, createProduct, createService, createUser } from '../helpers/factories';
import { Carbon } from '@/server/lib/carbon';
import { Invoice } from '@/server/models/Invoice';
import { Service } from '@/server/models/Service';

describe('ServiceRenewal', () => {
    useDatabase();

    /** a service with a pending renewal invoice that is paid right away */
    async function renew(serviceAttrs: Record<string, any>) {
        const user = await createUser();
        const product = await createProduct();
        const service = await createService({ user_id: user.id, plan_id: product.plan.id, product_id: product.product.id, ...serviceAttrs });
        const invoice = await createInvoice({ user_id: user.id, status: 'pending' });
        await invoice.relation('items').create({
            reference_id: service.id,
            reference_type: Service.morphName,
            description: 'Service Renewal',
            quantity: 1,
            price: 10.0,
        });

        // Process the paid invoice
        await invoice.relation('transactions').create({ amount: 10.0 });

        return {
            invoice: (await Invoice.find<Invoice>(invoice.id))!,
            service: (await Service.find<Service>(service.id))!,
        };
    }

    it('sets the due date of a pending service', async () => {
        const { invoice, service } = await renew({ status: 'pending' });

        expect(invoice.status).toBe('paid');
        expect(service.status).toBe('active');
        expect(service.expires_at).not.toBeNull();
    });

    it('extends the due date when the service is active', async () => {
        const { invoice, service } = await renew({ status: 'active', expires_at: Carbon.now().subDays(10) });

        expect(invoice.status).toBe('paid');
        expect(service.status).toBe('active');
        expect(service.expires_at).not.toBeNull();
        expect(service.expires_at!.lte(Carbon.now().addDays(21))).toBe(true);
    });

    it('sets the due date from now when the service is suspended', async () => {
        const { invoice, service } = await renew({ status: 'suspended', expires_at: Carbon.now().subDays(10) });

        expect(invoice.status).toBe('paid');
        expect(service.status).toBe('active');
        expect(service.expires_at).not.toBeNull();
        // one month from now minus a day (a few seconds for processing time)
        expect(service.expires_at!.gte(Carbon.now().addMonths(1).addDays(-1))).toBe(true);
    });
});
