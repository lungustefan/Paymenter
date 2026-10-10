import { describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { createInvoice, createUser } from '../helpers/factories';
import { Setting } from '@/server/models/Setting';
import { Invoice } from '@/server/models/Invoice';
import { setting } from '@/server/config';

describe('InvoiceNumber', () => {
    useDatabase();

    const settingValue = async (key: string) => String((await Setting.query().where('key', key).first())?.value);

    it('generates sequential invoice numbers', async () => {
        const user = await createUser();
        await Setting.updateOrCreate({ key: 'invoice_number' }, { value: 1000 });
        await Setting.updateOrCreate({ key: 'invoice_number_format' }, { value: '{number}' });

        const invoice = await createInvoice({ user_id: user.id });
        expect(Number(invoice.number)).toBe(1001);
        expect(await settingValue('invoice_number')).toBe('1001');

        // Do it once more for good measure
        const invoice2 = await createInvoice({ user_id: user.id });
        expect(Number(invoice2.number)).toBe(1002);
        expect(await settingValue('invoice_number')).toBe('1002');
    });

    it('only generates the number of a proforma invoice once it is paid', async () => {
        const user = await createUser();
        await Setting.updateOrCreate({ key: 'invoice_number' }, { value: 2000 });
        await Setting.updateOrCreate({ key: 'invoice_number_format' }, { value: '{number}' });
        await Setting.updateOrCreate({ key: 'invoice_proforma' }, { value: true });

        const invoice = await createInvoice({ user_id: user.id });
        await invoice.relation('items').create({ name: 'Test item', description: 'Test item', price: 10, quantity: 1 });

        // Number should not be set
        expect(invoice.number).toBeNull();

        // Config should still be 2000
        expect(Number(setting('invoice_number'))).toBe(2000);

        // Add paid transaction
        await invoice.relation('transactions').create({ amount: 10 });

        // Refresh invoice
        const fresh = (await Invoice.find<Invoice>(invoice.id))!;

        // Number should now be set to 2001
        expect(Number(fresh.number)).toBe(2001);
        expect(Number(setting('invoice_number'))).toBe(2001);
    });
});
