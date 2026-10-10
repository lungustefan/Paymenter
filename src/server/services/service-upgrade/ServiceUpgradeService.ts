import { dispatchJob } from '@/server/queue';
import { transaction } from '@/server/orm';
import { Service } from '@/server/models/Service';
import { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import { InvoiceItem } from '@/server/models/InvoiceItem';

export async function handleServiceUpgrade(serviceUpgrade: ServiceUpgrade) {
    return transaction(async () => {
        serviceUpgrade.status = ServiceUpgrade.STATUS_COMPLETED;
        await serviceUpgrade.save();

        // Check if old product stock should be increased
        const service = await serviceUpgrade.rel('service');
        const oldProduct = (await service.rel('product'))!;
        if (oldProduct.stock !== null && oldProduct.stock !== undefined) {
            await oldProduct.increment('stock', service.quantity);
        }

        service.plan_id = serviceUpgrade.plan_id;
        service.product_id = serviceUpgrade.product_id;
        await service.save();
        await service.refresh();

        // Decrease stock of new product if applicable
        const newProduct = (await service.rel('product'))!;
        if (newProduct.stock !== null && newProduct.stock !== undefined) {
            await newProduct.decrement('stock', service.quantity);
        }

        // Update service configurations - remove old configs and add new ones
        const upgradeConfigs = await serviceUpgrade.rel('configs');
        const newConfigOptionIds = upgradeConfigs.map((c) => c.config_option_id);

        // Delete configs that are no longer applicable
        await service.relation('configs').whereNotIn('config_option_id', newConfigOptionIds).delete();

        // Update or create new configs
        for (const config of upgradeConfigs) {
            await service.relation('configs').updateOrCreate({ config_option_id: config.config_option_id }, { config_value_id: config.config_value_id });
        }

        await service.refresh();
        service.price = Number(await service.calculatePrice());
        await service.save();

        // Is there a pending renewal invoice? Update it.
        const pendingInvoice = await service.relation('invoices').where('status', 'pending').first();
        if (pendingInvoice) {
            const item = await pendingInvoice
                .relation('items')
                .where('reference_type', Service.morphName)
                .where('reference_id', service.id)
                .first();
            if (item) {
                item.price = service.price;
                await item.save();
            }
        }

        if (await (await service.rel('product'))!.rel('server')) {
            await dispatchJob('server.upgrade', { service });
        }
    });
}

export class ServiceUpgradeService {
    handle(serviceUpgrade: ServiceUpgrade) {
        return handleServiceUpgrade(serviceUpgrade);
    }
}
