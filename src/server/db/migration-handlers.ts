import type { PoolConnection } from 'mysql2/promise';

/**
 * Data migrations that cannot be expressed as plain SQL. They run after the
 * SQL file with the same name has been applied.
 */
export const afterMigration: Record<string, (conn: PoolConnection) => Promise<void>> = {
    /**
     * `Invoice::where('status', 'paid')->whereDoesntHave('snapshot')->chunk(100, ...)` of the PHP migration:
     * paid invoices that exist before the snapshots do get one with the data of their user as it is now.
     * (Databases that were created by the PHP release have run this already.)
     */
    '2025_09_16_130604_create_invoice_snapshots_table': async () => {
        const { ensureSettings } = await import('@/server/settings/store');
        const { Invoice } = await import('@/server/models/Invoice');
        const { createInvoiceSnapshot } = await import('@/server/services/invoice/CreateInvoiceSnapshotService');
        await ensureSettings(true);
        const [{ total }] = (await (await import('@/server/db/connection')).getPool().query<any[]>("select count(*) as total from invoices where status = 'paid'"))[0];
        if (!Number(total)) return;
        let lastId = 0;
        for (;;) {
            const batch = await Invoice.query().where('status', 'paid').where('id', '>', lastId).orderBy('id').limit(100).get();
            if (batch.length === 0) break;
            for (const invoice of batch) {
                await createInvoiceSnapshot(invoice, true);
                lastId = invoice.id as number;
            }
        }
    },
};
