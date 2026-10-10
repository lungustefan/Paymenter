import { transaction } from '@/server/orm';
import type { Invoice } from '@/server/models/Invoice';
import { Service } from '@/server/models/Service';
import { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import { Credit } from '@/server/models/Credit';
import { User } from '@/server/models/User';
import { renewService } from '@/server/services/service/RenewServiceService';
import { handleServiceUpgrade } from '@/server/services/service-upgrade/ServiceUpgradeService';

/** Update services / upgrades / credits once an invoice has been paid. */
export async function processPaidInvoice(invoice: Invoice): Promise<void> {
    for (const item of await invoice.rel('items')) {
        if (item.reference_type === Service.morphName) {
            const service = await item.rel('reference');
            if (!service || !(service instanceof Service)) continue;
            await renewService(service);
        } else if (item.reference_type === ServiceUpgrade.morphName) {
            const upgrade = await item.rel('reference');
            if (!upgrade || !(upgrade instanceof ServiceUpgrade) || upgrade.status !== ServiceUpgrade.STATUS_PENDING) continue;
            // Handle the upgrade
            await handleServiceUpgrade(upgrade);
        } else if (item.reference_type === Credit.morphName) {
            await transaction(async () => {
                const user = await User.query().where('id', invoice.user_id).lockForUpdate().first();
                const credit = await Credit.query().where('user_id', user!.id).where('currency_code', invoice.currency_code).lockForUpdate().first();
                if (credit) {
                    await credit.increment('amount', Number(item.price));
                } else {
                    await Credit.create({ user_id: user!.id, currency_code: invoice.currency_code, amount: item.price });
                }
            });
        }
    }
}

export class ProcessPaidInvoiceService {
    handle(invoice: Invoice) {
        return processPaidInvoice(invoice);
    }
}
