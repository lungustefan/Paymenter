import { describe, expect, it } from 'vitest';
import { useDatabase } from '../../helpers/db';
import { configSettings, createInvoice, createProduct, createService, createUser } from '../../helpers/factories';
import { Carbon } from '@/server/lib/carbon';
import { InvoiceTransactionStatus } from '@/server/enums';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Invoice } from '@/server/models/Invoice';
import { Service } from '@/server/models/Service';

describe('InvoicePaymentProcessing', () => {
    useDatabase();

    async function createInvoiceWithItem(total = 100.0) {
        const user = await createUser();
        const invoice = await createInvoice({ user_id: user.id, status: 'pending' });
        await invoice.relation('items').create({ description: 'Test Item', quantity: 1, price: total });
        return (await Invoice.find<Invoice>(invoice.id))!;
    }
    const fresh = async (invoice: Invoice) => (await Invoice.find<Invoice>(invoice.id))!;

    it('starts with draft status', async () => {
        const user = await createUser();
        const created = await createInvoice({ user_id: user.id });
        await created.relation('items').create({ description: 'Test Item', quantity: 1, price: 100 });
        const invoice = await fresh(created);

        expect(invoice.status).toBe('draft');
        expect(await invoice.total()).toBeGreaterThan(0);
    });

    it('snapshots a pending invoice when it is created', async () => {
        configSettings({ invoice_snapshot: true });
        const user = await createUser();
        const invoice = await createInvoice({ user_id: user.id, status: Invoice.STATUS_PENDING });

        expect((await (await fresh(invoice)).rel('snapshot'))?.name).toBe(user.displayName());
    });

    it('calculates the remaining amount correctly', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        // No payments yet
        expect(await invoice.remaining()).toBe(100.0);

        // Add partial payment
        await invoice.relation('transactions').create({ amount: 30.0, status: InvoiceTransactionStatus.Succeeded });

        expect(await (await fresh(invoice)).remaining()).toBe(70.0);
    });

    it('calculates the invoice totals without floating point errors', async () => {
        const invoice = await createInvoiceWithItem(0.1);
        await invoice.relation('items').create({ description: 'Second Test Item', quantity: 2, price: 0.1 });

        const refreshed = await fresh(invoice);
        expect(await refreshed.total()).toBe(0.3);

        await refreshed.relation('transactions').create({ amount: 0.1, status: InvoiceTransactionStatus.Succeeded });

        expect(await (await fresh(invoice)).remaining()).toBe(0.2);
    });

    it('marks a decimal invoice as paid when the full amount is paid', async () => {
        const invoice = await createInvoiceWithItem(179.99);
        await invoice.relation('items').create({ description: 'Second Test Item', quantity: 1, price: 69.99 });

        await ExtensionHelper.addPayment(invoice.id, 'TestGateway', 249.98);

        const paid = await fresh(invoice);
        expect(paid.status).toBe('paid');
        expect(await paid.remaining()).toBe(0);
    });

    it('marks the invoice as paid after a successful payment', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        // Process full payment
        await ExtensionHelper.addPayment(invoice.id, 'TestGateway', 100.0, 2.5, 'test_txn_123');

        const paid = await fresh(invoice);
        expect(paid.status).toBe('paid');
        expect(await paid.remaining()).toBe(0);
        expect(await paid.relation('transactions').count()).toBe(1);

        const transaction = (await paid.relation('transactions').first())!;
        expect(Number(transaction.amount)).toBe(100.0);
        expect(Number(transaction.fee)).toBe(2.5);
        expect(transaction.transaction_id).toBe('test_txn_123');
    });

    it('keeps the invoice pending after a partial payment', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        await ExtensionHelper.addPayment(invoice.id, 'TestGateway', 60.0);

        const pending = await fresh(invoice);
        expect(pending.status).toBe('pending');
        expect(await pending.remaining()).toBe(40.0);
    });

    it('marks the invoice as paid on overpayment', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        await ExtensionHelper.addPayment(invoice.id, 'TestGateway', 150.0);

        const paid = await fresh(invoice);
        expect(paid.status).toBe('paid');
        expect(await paid.remaining()).toBe(-50.0); // Credit balance
    });

    it('activates the service when the invoice is paid', async () => {
        const user = await createUser();
        const product = await createProduct();

        const service = await createService({ status: 'pending', user_id: user.id, product_id: product.product.id, plan_id: product.plan.id });
        const invoice = await createInvoice({
            user_id: service.user_id,
            status: 'pending',
            due_at: Carbon.now().addDays(7),
            currency_code: service.currency_code,
        });

        // Link service to invoice
        await invoice.relation('items').create({
            reference_type: Service.morphName,
            reference_id: service.id,
            price: 100.0,
            quantity: 1,
            description: 'blah',
        });

        // Pay the invoice
        await ExtensionHelper.addPayment(invoice.id, 'Stripe', 100.0);

        const active = (await Service.find<Service>(service.id))!;
        expect(active.status).toBe('active');
        expect(active.expires_at).not.toBeNull();
    });

    it('handles multiple partial payments', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        await ExtensionHelper.addPayment(invoice.id, 'Stripe', 30.0);
        await ExtensionHelper.addPayment(invoice.id, 'PayPal', 40.0);
        // Third payment completes it
        await ExtensionHelper.addPayment(invoice.id, 'Stripe', 30.0);

        const paid = await fresh(invoice);
        expect(paid.status).toBe('paid');
        expect(await paid.remaining()).toBe(0);
        expect(await paid.relation('transactions').count()).toBe(3);
    });

    it('records the payment fee', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        await ExtensionHelper.addPayment(invoice.id, 'Stripe', 100.0, 3.2, 'pi_123');

        const transaction = (await invoice.relation('transactions').first())!;
        expect(Number(transaction.fee)).toBe(3.2);
    });

    it('can update the fee after the payment', async () => {
        const invoice = await createInvoiceWithItem(100.0);

        // Initial payment without fee
        await ExtensionHelper.addPayment(invoice.id, 'Stripe', 100.0, null, 'pi_123');

        let transaction = (await invoice.relation('transactions').first())!;
        expect(Number(transaction.fee)).toBe(0);

        // Update fee (from Stripe webhook)
        await ExtensionHelper.addPaymentFee('pi_123', 2.9);

        transaction = (await invoice.relation('transactions').first())!;
        expect(Number(transaction.fee)).toBe(2.9);
    });
});
