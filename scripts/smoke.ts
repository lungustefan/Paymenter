import { loadEnv } from '@/server/env';
loadEnv();
import { migrate, dropAllTables } from '@/server/db/migrate';
import { closePool } from '@/server/db/connection';

async function main() {
    await dropAllTables();
    await migrate();
    const { boot } = await import('@/server/bootstrap');
    const { seed } = await import('@/server/db/seed');
    await boot();
    await seed(console.log);
    const { ensureSettings } = await import('@/server/settings/store');
    await ensureSettings(true);

    const M = await import('@/server/models');
    const { setting } = await import('@/server/config');
    console.log('settings loaded:', Object.keys((await import('@/server/config')).allSettings()).length, 'default_currency=', setting('default_currency'), 'tax_enabled=', setting('tax_enabled'), 'ticket_departments=', setting('ticket_departments'));

    // users / role
    const role = await M.Role.query().where('name', 'admin').firstOrFail();
    const admin = await M.User.create({ first_name: 'Ada', last_name: 'Admin', email: 'admin@example.com', password: 'secret-pass', role_id: role.id });
    console.log('admin hashed:', admin.password.startsWith('$2y$'), 'perm *:', await admin.hasPermission('anything'));
    const customer = await M.User.create({ first_name: 'Cy', last_name: 'Customer', email: 'cy@example.com', password: 'pw' });

    // catalog
    const cat = await M.Category.create({ name: 'Hosting', slug: 'hosting' });
    const child = await M.Category.create({ name: 'VPS', slug: 'vps', parent_id: cat.id });
    console.log('full_slug:', child.full_slug);
    const product = await M.Product.create({ category_id: cat.id, name: 'Starter', slug: 'starter', stock: 5 });
    const plan = await product.relation<InstanceType<typeof M.Plan>>('plans').create({ type: 'recurring', billing_period: 1, billing_unit: 'month', name: 'Monthly' });
    await plan.relation('prices').create({ currency_code: 'USD', price: 9.99, setup_fee: 1 });
    const price = await product.price();
    console.log('price:', String(price), 'setup:', price.formatted.setup_fee, 'available plans:', (await product.availablePlans()).length);

    // order + service + invoice
    const order = await M.Order.create({ user_id: customer.id, currency_code: 'USD' });
    const service = await M.Service.create({ order_id: order.id, product_id: product.id, user_id: customer.id, plan_id: plan.id, currency_code: 'USD', price: 9.99, quantity: 1, status: 'pending' });
    console.log('service label:', await service.displayLabel(), '| next due:', (await service.calculateNextDueDate())?.toDateTimeString());
    const invoice = await M.Invoice.create({ user_id: customer.id, currency_code: 'USD', status: 'pending', due_at: new Date() as any });
    await invoice.relation('items').create({ reference_id: service.id, reference_type: M.Service.morphName, price: 9.99, quantity: 1, description: await service.description() });
    console.log('invoice number:', invoice.number, '| total:', String(await invoice.formattedTotal()), '| remaining:', await invoice.remaining());

    // pay it
    const { ExtensionHelper } = await import('@/server/extensions/helper');
    await ExtensionHelper.addPayment(invoice.id, null, 9.99, null, 'tx-1');
    const paid = await M.Invoice.findOrFail<InstanceType<typeof M.Invoice>>(invoice.id);
    console.log('invoice status after payment:', paid.status);
    const renewed = await M.Service.findOrFail<InstanceType<typeof M.Service>>(service.id);
    console.log('service status:', renewed.status, 'expires:', renewed.expires_at?.toDateTimeString());
    console.log('snapshot:', (await paid.rel('snapshot'))?.name, '| audits:', await M.Audit.query().count(), '| email logs:', await M.EmailLog.query().count(), '| notifications:', await M.Notification.query().count(), '| jobs:', await (await import('@/server/orm')).currentDb().$count((await import('@/server/db/schema')).jobs));

    // render an email template
    const { NotificationHelper } = await import('@/server/helpers/NotificationHelper');
    const logs = await M.EmailLog.query().get();
    for (const l of logs) console.log('EMAIL', l.subject, '->', l.to, '| html bytes:', l.body.length);
    void NotificationHelper;
    await closePool();
}
main().catch(async (e) => { console.error('SMOKE FAILED', e); await closePool(); process.exit(1); });
