import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../../helpers/db';
import { configSettings, createInvoice, createUser } from '../../helpers/factories';
import { AdjustmentNoteStatus, AdjustmentNoteType, InvoiceTransactionStatus } from '@/server/enums';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Events } from '@/server/event-defs';
import { listen } from '@/server/events';
import { setting } from '@/server/config';
import { can } from '@/server/policies';
import { Gateway } from '@/server/models/Gateway';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { Setting } from '@/server/models/Setting';
import { Role } from '@/server/models/Role';
import { flushTerminating } from '@/server/terminating';
import { afterMigration } from '@/server/db/migration-handlers';
import { InvoiceSnapshot } from '@/server/models/InvoiceSnapshot';

describe('ImmutableInvoices', () => {
    useDatabase();
    // the emails of the invoices of a test are sent after it, while its users still exist
    afterEach(async () => {
        await flushTerminating();
    });

    const fresh = async (invoice: Invoice) => (await Invoice.find<Invoice>(invoice.id))!;

    async function pendingInvoice(price = 100) {
        const user = await createUser();
        const invoice = await createInvoice({ user_id: user.id, status: Invoice.STATUS_PENDING });
        await invoice.relation('items').create({ description: 'Item', quantity: 1, price });
        return fresh(invoice);
    }

    describe('adjustment notes', () => {
        it('adds active debit notes and subtracts active credit notes (credits are negative) from the total', async () => {
            const invoice = await pendingInvoice(100);
            await invoice.relation('adjustmentNotes').create({ type: AdjustmentNoteType.Debit, amount: 25.5, description: 'Late fee' });
            await invoice.relation('adjustmentNotes').create({ type: AdjustmentNoteType.Credit, amount: -10.25, description: 'Goodwill' });
            await invoice.relation('adjustmentNotes').create({ type: AdjustmentNoteType.Credit, amount: -50, status: AdjustmentNoteStatus.Voided });

            const reloaded = await fresh(invoice);
            expect(await reloaded.total()).toBe(115.25);
            expect(await reloaded.currentBalance()).toBe(115.25);
            expect(await reloaded.remaining()).toBe(115.25);
        });

        it('numbers credit / debit notes with their own counter and format', async () => {
            await Setting.updateOrCreate({ key: 'credit_note_number' }, { value: 41 });
            await Setting.updateOrCreate({ key: 'credit_note_number_padding' }, { value: 4 });
            await Setting.updateOrCreate({ key: 'credit_note_number_format' }, { value: 'CN-{number}' });
            await Setting.updateOrCreate({ key: 'invoice_number' }, { value: 7 });
            await Setting.updateOrCreate({ key: 'invoice_number_format' }, { value: '{number}' });
            const invoice = await pendingInvoice();

            const note = await invoice.relation('adjustmentNotes').create({ type: AdjustmentNoteType.Debit, amount: 5 });
            const second = await invoice.relation('adjustmentNotes').create({ type: AdjustmentNoteType.Credit, amount: -5 });

            expect(note.number).toBe('CN-0042');
            expect(second.number).toBe('CN-0043');
            expect(String((await Setting.query().where('key', 'credit_note_number').first())?.value)).toBe('43');
            // the invoice counter only moved for the invoice itself
            expect(Number(invoice.number)).toBe(8);
            expect(String((await Setting.query().where('key', 'invoice_number').first())?.value)).toBe('8');
        });

        it('creates a credit note for the whole total when an invoice is cancelled', async () => {
            const invoice = await pendingInvoice(80);

            await invoice.update({ status: Invoice.STATUS_CANCELLED, cancellation_reason: 'Customer asked' });

            const cancelled = await fresh(invoice);
            expect(cancelled.cancellation_reason).toBe('Customer asked');
            const notes = await cancelled.rel('adjustmentNotes');
            expect(notes).toHaveLength(1);
            expect(notes[0].type).toBe(AdjustmentNoteType.Credit);
            expect(Number(notes[0].amount)).toBe(-80);
            expect(notes[0].description).toBe('Customer asked');
            expect(await cancelled.total()).toBe(0);
        });

        it('does not add a second credit note when a cancelled invoice is saved again', async () => {
            const invoice = await pendingInvoice(80);
            await invoice.update({ status: Invoice.STATUS_CANCELLED });
            const cancelled = await fresh(invoice);
            await cancelled.update({ due_at: '2030-01-01' });

            expect(await cancelled.relation('adjustmentNotes').count()).toBe(1);
        });
    });

    describe('draft invoices', () => {
        it('does not announce or snapshot a draft, and does when it is published', async () => {
            configSettings({ invoice_snapshot: true, invoice_proforma: true });
            await flushTerminating();
            let created = 0;
            let finalized = 0;
            listen(Events.Invoice.Created, () => void created++);
            listen(Events.Invoice.Finalized, () => void finalized++);
            const user = await createUser();
            const draft = await createInvoice({ user_id: user.id, status: Invoice.STATUS_DRAFT });
            await flushTerminating();

            // a draft is neither finalized (email, PDF) nor locked (snapshot, number in proforma mode)
            expect(finalized).toBe(0);
            expect(await (await fresh(draft)).rel('snapshot')).toBeNull();
            expect(draft.number).toBeNull();

            const loaded = await fresh(draft);
            loaded.status = Invoice.STATUS_PENDING;
            await loaded.save();
            await flushTerminating();

            const published = await fresh(draft);
            expect(published.number).toBeTruthy();
            expect((await published.rel('snapshot'))?.name).toBe(user.displayName());
            expect(finalized).toBe(1);
            expect(created).toBe(2);
        });

        it('only lets an admin update a draft when immutable invoices are enabled', async () => {
            await Role.updateOrCreate({ name: 'billing' }, { permissions: ['admin.invoices.update'] });
            const role = (await Role.query().where('name', 'billing').first())!;
            const admin = await createUser({ role_id: role.id });
            const user = await createUser();
            const draft = await createInvoice({ user_id: user.id, status: Invoice.STATUS_DRAFT });
            const pending = await createInvoice({ user_id: user.id, status: Invoice.STATUS_PENDING });

            configSettings({ immutable_invoices_enabled: false });
            expect(await can(admin, 'update', pending)).toBe(true);

            configSettings({ immutable_invoices_enabled: true });
            expect(setting('immutable_invoices_enabled')).toBe(true);
            expect(await can(admin, 'update', draft)).toBe(true);
            expect(await can(admin, 'update', pending)).toBe(false);
            // without a record only the permission counts
            expect(await can(admin, 'update', Invoice)).toBe(true);
        });
    });

    describe('refunds', () => {
        async function paidInvoice() {
            const invoice = await pendingInvoice(100);
            await ExtensionHelper.addPayment(invoice.id, null, 100, null, 'txn_100');
            const paid = await fresh(invoice);
            const transaction = (await paid.relation<InvoiceTransaction>('transactions').first())!;
            return { paid, transaction };
        }

        it('refunds locally: raises refunded_amount and adds a credit note, the invoice stays paid', async () => {
            const { paid, transaction } = await paidInvoice();
            expect(paid.status).toBe('paid');

            await ExtensionHelper.refundLocally(transaction, 30);

            const reloaded = await fresh(paid);
            const tr = (await reloaded.relation<InvoiceTransaction>('transactions').first())!;
            expect(Number(tr.refunded_amount)).toBe(30);
            expect(tr.refundableAmount()).toBe(70);
            const notes = await reloaded.rel('adjustmentNotes');
            expect(notes).toHaveLength(1);
            expect(Number(notes[0].amount)).toBe(-30);
            expect(notes[0].type).toBe(AdjustmentNoteType.Credit);
            expect(notes[0].description).toContain('txn_100');
            // total fell by the credit, paid fell by the refund: nothing left to pay
            expect(await reloaded.total()).toBe(70);
            expect(await reloaded.remaining()).toBe(0);
            expect(reloaded.status).toBe('paid');
        });

        it('refuses a refund larger than what is left, or not positive', async () => {
            const { transaction } = await paidInvoice();
            await ExtensionHelper.refundLocally(transaction, 60);

            await expect(ExtensionHelper.refundLocally(transaction, 40.01)).rejects.toThrow(/exceeds refundable amount/);
            await expect(ExtensionHelper.refundLocally(transaction, 0)).rejects.toThrow(/greater than 0/);
            await ExtensionHelper.refundLocally(transaction, 40);
            const tr = (await InvoiceTransaction.find<InvoiceTransaction>(transaction.id))!;
            expect(tr.refundableAmount()).toBe(0);
        });

        it('refunds through the gateway and records nothing when the gateway fails', async () => {
            const { transaction } = await paidInvoice();
            const gateway = await Gateway.create({ name: 'Fake', extension: 'Mollie', type: 'gateway', enabled: true });
            await InvoiceTransaction.query().where('id', transaction.id).update({ gateway_id: gateway.id });
            const refund = vi.fn(async () => true);
            const instance = { supportsRefunds: () => true, refund };
            vi.spyOn(ExtensionHelper, 'getExtension').mockResolvedValue(instance as any);
            vi.spyOn(ExtensionHelper, 'hasFunction').mockResolvedValue(true);
            try {
                const tr = (await InvoiceTransaction.find<InvoiceTransaction>(transaction.id))!;
                await ExtensionHelper.refund(tr, 25);
                expect(refund).toHaveBeenCalledTimes(1);
                expect(Number((await InvoiceTransaction.find<InvoiceTransaction>(transaction.id))!.refunded_amount)).toBe(25);

                refund.mockResolvedValueOnce(false);
                await expect(ExtensionHelper.refund(tr, 10)).rejects.toThrow(/refund failed/);
                expect(Number((await InvoiceTransaction.find<InvoiceTransaction>(transaction.id))!.refunded_amount)).toBe(25);
            } finally {
                vi.restoreAllMocks();
            }
        });

        it('ignores refunded transactions that are not succeeded when computing the balance', async () => {
            const invoice = await pendingInvoice(100);
            await invoice.relation('transactions').create({ amount: 40, status: InvoiceTransactionStatus.Failed });
            expect(await (await fresh(invoice)).currentBalance()).toBe(100);
        });
    });

    describe('snapshot backfill', () => {
        it('gives paid invoices without a snapshot one when the snapshots table is created', async () => {
            configSettings({ invoice_snapshot: false, bill_to_text: 'Bill me' });
            const user = await createUser();
            const paid = await createInvoice({ user_id: user.id, status: Invoice.STATUS_PAID });
            const pending = await createInvoice({ user_id: user.id, status: Invoice.STATUS_PENDING });
            await InvoiceSnapshot.query().delete();
            await Setting.updateOrCreate({ key: 'bill_to_text' }, { value: 'Bill me' });

            await afterMigration['2025_09_16_130604_create_invoice_snapshots_table']({} as any);

            const snapshot = await InvoiceSnapshot.query().where('invoice_id', paid.id).first();
            expect(snapshot?.name).toBe(user.displayName());
            expect(snapshot?.bill_to).toBe('Bill me');
            expect(await InvoiceSnapshot.query().where('invoice_id', pending.id).exists()).toBe(false);
            // running it again does not duplicate
            await afterMigration['2025_09_16_130604_create_invoice_snapshots_table']({} as any);
            expect(await InvoiceSnapshot.query().where('invoice_id', paid.id).count()).toBe(1);
        });
    });
});
