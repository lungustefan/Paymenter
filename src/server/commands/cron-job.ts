import { setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { t } from '@/server/i18n';
import { dispatchJob } from '@/server/queue';
import { transaction, afterCommit, currentDb } from '@/server/orm';
import { setAuditConsole } from '@/server/orm/audit';
import { sql } from 'drizzle-orm';
import { ExtensionHelper } from '@/server/extensions/helper';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { renewService } from '@/server/services/service/RenewServiceService';
import { CronStat } from '@/server/models/CronStat';
import { DebugLog } from '@/server/models/DebugLog';
import { EmailLog } from '@/server/models/EmailLog';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceItem } from '@/server/models/InvoiceItem';
import { Service } from '@/server/models/Service';
import { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import { Setting } from '@/server/models/Setting';
import { Ticket } from '@/server/models/Ticket';
import { checkForUpdates } from './check-for-updates';

/** Port of App\Console\Commands\CronJob (`app:cron-job`). */
export async function cronJob(info: (msg: string) => void = console.log): Promise<void> {
    setAuditConsole(true); // Config::set('audit.console', true)
    let successfulCharges = 0;

    const runCronJob = async (key: string, callback: () => Promise<number>) => {
        const items = (await callback()) ?? 0;
        await CronStat.create({ key, value: items, date: Carbon.now().toDateString() });
        info(`Cronjob task '${t(`admin.cronjob.${key}`)}' completed: Processed ${items} items.`);
    };

    const payInvoiceWithCredits = async (invoice: Invoice) => {
        if (!setting('credits_auto_use', true)) return;
        const user = (await invoice.rel('user'))!;
        const credits = await user.relation('credits').where('currency_code', invoice.currency_code).lockForUpdate().first();
        const fresh = (await invoice.fresh())!;
        const remaining = await fresh.remaining();
        if (remaining > 0 && credits && Number(credits.amount) >= remaining) {
            credits.amount = Number(credits.amount) - remaining;
            await credits.save();
            await ExtensionHelper.addPayment(invoice.id, null, remaining, null, null, 'succeeded', true);
        }
    };

    try {
        await transaction(async () => {
            // Send invoices if due date is x days away
            await runCronJob('invoices_created', async () => {
                let number = 0;
                const services = await Service.query()
                    .where('status', 'active')
                    .where('expires_at', '<', Carbon.now().addDays(Number(setting('cronjob_invoice', 7))))
                    .get();
                for (const service of services) {
                    // Does the service have already a pending invoice?
                    if ((await service.relation('invoices').where('status', 'pending').exists()) || (await service.relation('cancellation').exists())) continue;

                    // Calculate if we should edit the price because of the coupon
                    const coupon = await service.rel('coupon');
                    if (coupon) {
                        // Calculate what iteration of the coupon we are in
                        const iteration = (await service.relation('invoices').count()) + 1;
                        if (iteration === coupon.recurring) {
                            service.price = Number(await service.calculatePrice());
                            await service.save();
                        }
                    }

                    // If service price is 0, immediately activate next period
                    if (Number(service.price) <= 0) {
                        await renewService(service);
                        number++;
                        continue;
                    }

                    // Create invoice
                    const invoice = new Invoice({
                        user_id: service.user_id,
                        status: 'pending',
                        due_at: service.expires_at,
                        currency_code: service.currency_code,
                    });
                    await invoice.save();

                    // Create invoice items
                    await invoice.relation<InvoiceItem>('items').create({
                        reference_id: service.id,
                        reference_type: Service.morphName,
                        price: service.price,
                        quantity: service.quantity,
                        description: await service.description(),
                    });
                    await invoice.refresh();

                    await payInvoiceWithCredits(invoice);

                    // Charge billing agreements
                    if (service.billing_agreement_id && (await invoice.fresh())!.status === 'pending') {
                        await afterCommit(async () => {
                            try {
                                const agreement = (await service.rel('billingAgreement'))!;
                                await ExtensionHelper.charge((await agreement.rel('gateway'))!, invoice, agreement);
                                successfulCharges++;
                            } catch {
                                // Ignore errors here
                                await NotificationHelper.invoicePaymentFailedNotification((await invoice.rel('user'))!, invoice);
                            }
                        });
                    }
                    number++;
                }
                return number;
            });

            await runCronJob('orders_cancelled', async () => {
                let number = 0;
                // Cancel services if first invoice is not paid after x days
                const services = await Service.query()
                    .where('status', 'pending')
                    .whereDoesntHave('invoices', (q) => q.where('status', 'paid'))
                    .where('created_at', '<', Carbon.now().subDays(Number(setting('cronjob_order_cancel', 7))))
                    .get();
                for (const service of services) {
                    await service.relation('invoices').where('status', 'pending').update({ status: 'cancelled' });
                    await service.update({ status: 'cancelled' });
                    const product = (await service.rel('product'))!;
                    if (product.stock !== null && product.stock !== undefined) await product.increment('stock', service.quantity);
                    number++;
                }
                return number;
            });

            await runCronJob('upgrade_invoices_updated', async () => {
                let number = 0;
                // Update pending upgrade invoices
                for (const upgrade of await ServiceUpgrade.query().where('status', 'pending').get()) {
                    const service = await upgrade.rel('service');
                    if (service.expires_at && service.expires_at.lt(Carbon.now())) {
                        await upgrade.update({ status: 'cancelled' });
                        // Somehow people manage to have an upgrade without an invoice
                        const invoice = await upgrade.rel('invoice');
                        if (invoice) await invoice.update({ status: 'cancelled' });
                        number++;
                        continue;
                    }
                    const invoice = await upgrade.rel('invoice');
                    if (!invoice) continue;
                    await invoice.relation('items').update({ price: (await upgrade.calculatePrice()).price });
                    number++;
                }
                return number;
            });

            await runCronJob('services_suspended', async () => {
                let number = 0;
                // Suspend orders if due date is overdue for x days
                const services = await Service.query()
                    .where('status', 'active')
                    .where('expires_at', '<', Carbon.now().subDays(Number(setting('cronjob_order_suspend', 2))))
                    .get();
                for (const service of services) {
                    await dispatchJob('server.suspend', { service });
                    await service.update({ status: 'suspended' });
                    number++;
                }
                return number;
            });

            await runCronJob('services_terminated', async () => {
                let number = 0;
                // Terminate orders if due date is overdue for x days
                const services = await Service.query()
                    .where('status', 'suspended')
                    .where('expires_at', '<', Carbon.now().subDays(Number(setting('cronjob_order_terminate', 14))))
                    .get();
                for (const service of services) {
                    await dispatchJob('server.terminate', { service });
                    await service.update({ status: 'cancelled' });
                    // Cancel outstanding invoices
                    await service.relation('invoices').where('status', 'pending').update({ status: 'cancelled' });
                    const product = (await service.rel('product'))!;
                    if (product.stock !== null && product.stock !== undefined) await product.increment('stock', service.quantity);
                    number++;
                }
                return number;
            });

            await runCronJob('tickets_closed', async () => {
                let number = 0;
                // Close tickets if no response for x days
                for (const ticket of await Ticket.query().where('status', 'replied').get()) {
                    const last = await ticket.relation('messages').latest('created_at').first();
                    if (last && last.created_at.lt(Carbon.now().subDays(Number(setting('cronjob_close_ticket', 7))))) {
                        await ticket.update({ status: 'closed' });
                        number++;
                    }
                }
                return number;
            });

            await runCronJob('email_logs_deleted', async () => {
                const cutoff = Carbon.now().subDays(Number(setting('cronjob_delete_email_logs', 90)));
                const number = await EmailLog.query().where('created_at', '<', cutoff).count();
                // Delete email logs older then x
                await EmailLog.query().where('created_at', '<', cutoff).delete();
                return number;
            });
        });
    } catch (e: any) {
        await NotificationHelper.sendSystemEmailNotification(
            'Cron Job Error',
            `An error occurred while running the cron job:<br>\n<pre>${e?.message ?? e}.</pre><br>\nPlease check the system and application logs for more details.`,
        );
        throw e;
    }

    await Setting.updateOrCreate({ settingable_type: CronStat.morphName, key: 'last_cron_run' }, { value: Carbon.now().toDateTimeString(), type: 'string' });
    await CronStat.create({ key: 'invoice_charged', value: successfulCharges, date: Carbon.now().toDateString() });
    info(`Successfully charged ${successfulCharges} invoices.`);

    // Remove old debug logs
    await DebugLog.query().where('created_at', '<', Carbon.now().subDays(30)).delete();

    // Check for updates
    info('Checking for updates...');
    await checkForUpdates(info);
    void currentDb;
    void sql;
}
