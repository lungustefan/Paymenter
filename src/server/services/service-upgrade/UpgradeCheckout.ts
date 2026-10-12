import { transaction } from '@/server/orm';
import { DisplayException } from '@/server/exceptions';
import { Carbon } from '@/server/lib/carbon';
import { setting } from '@/server/config';
import { route } from '@/server/routes';
import { Service } from '@/server/models/Service';
import { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import { ServiceConfig } from '@/server/models/ServiceConfig';
import { Invoice } from '@/server/models/Invoice';
import { User } from '@/server/models/User';
import type { Product } from '@/server/models/Product';
import type { Price } from '@/server/classes/Price';
import { handleServiceUpgrade } from './ServiceUpgradeService';

/** `Livewire\Services\Upgrade::totalToday()` - price of switching to `upgradeProduct` with the chosen options. */
export async function upgradeTotal(service: Service, upgradeProduct: Product, configOptions: Record<string, any>): Promise<Price> {
    const upgrade = new ServiceUpgrade({});
    upgrade.setRelation('service', service);
    upgrade.setRelation('product', upgradeProduct);

    const options = await upgradeProduct.rel('upgradableConfigOptions');
    const configs: ServiceConfig[] = [];
    for (const [optionId, value] of Object.entries(configOptions)) {
        const option = options.find((o) => String(o.id) === String(optionId));
        if (!option) continue;
        const children = await option.rel('children');
        if (!children.some((c) => String(c.id) === String(value))) continue;
        configs.push(new ServiceConfig({ config_option_id: Number(optionId), config_value_id: Number(value) }));
    }
    upgrade.setRelation('configs', configs);
    return upgrade.calculatePrice();
}

export async function upgradePlanFor(service: Service, upgradeProduct: Product) {
    const plan = (await service.rel('plan'))!;
    return (await upgradeProduct.availablePlans()).find((p) => p.billing_period === plan.billing_period && p.billing_unit === plan.billing_unit) ?? null;
}

export interface UpgradeResult {
    redirect: string;
    flash?: { message: string; type: 'success' | 'error' };
}

/** `Livewire\Services\Upgrade::doUpgrade()` */
export async function doUpgrade(serviceId: number, userId: number, upgradeProduct: Product, configOptions: Record<string, any>): Promise<UpgradeResult | { error: string }> {
    return transaction(async () => {
        const service = (await Service.query().where('id', serviceId).lockForUpdate().first())!;

        // Validate upgradable again after locking the service
        if ((await service.relation('upgrade').where('status', ServiceUpgrade.STATUS_PENDING).count()) !== 0) {
            return { redirect: route('services.show', service, false), flash: { message: 'This service is not upgradable.', type: 'error' as const } };
        }

        const upgradePlan = (await upgradePlanFor(service, upgradeProduct))!;
        const serviceConfigs = await service.rel('configs');
        const upgradable = await upgradeProduct.rel('upgradableConfigOptions');

        // The old config options must be in upgradableConfigOptions
        const current: Record<string, number> = {};
        for (const c of serviceConfigs) if (upgradable.some((o) => o.id === c.config_option_id)) current[String(c.config_option_id)] = c.config_value_id as number;

        // If the product did not change and the config options are the same, present the user with a message
        const same = Object.keys(configOptions).length === Object.keys(current).length && Object.entries(configOptions).every(([k, v]) => String(current[k]) === String(v));
        if (upgradeProduct.id === service.product_id && same) {
            throw new DisplayException('You have not changed anything. Please select a different product or change the configuration options.');
        }

        const upgrade = new ServiceUpgrade({ service_id: service.id, product_id: upgradeProduct.id, plan_id: upgradePlan.id });
        await upgrade.save();

        if (Object.keys(configOptions).length) {
            for (const option of upgradable) {
                if (configOptions[String(option.id)] === undefined) continue;
                await upgrade.relation('configs').create({ config_option_id: option.id, config_value_id: configOptions[String(option.id)] });
            }
        }

        // `$upgrade->calculatePrice()` reads the relations from the database
        upgrade.unsetRelation('configs');
        const price = await upgrade.calculatePrice();

        if (price.price <= 0) {
            await handleServiceUpgrade(upgrade);

            if (!setting('credits_on_downgrade', true)) {
                return { redirect: route('services.show', service, false), flash: { message: 'The upgrade has been completed.', type: 'success' as const } };
            }
            const user = (await User.query().where('id', userId).lockForUpdate().first())!;
            const currencyCode = (price.currency as any)?.code as string;
            const credit = await user.relation('credits').where('currency_code', currencyCode).first();
            if (credit) await credit.increment('amount', Math.abs(price.price));
            else await user.relation('credits').create({ currency_code: currencyCode, amount: Math.abs(price.price) });

            return {
                redirect: route('services.show', service, false),
                flash: {
                    message: price.price < 0 ? "The upgrade has been completed. We've added the remaining amount to your account balance." : 'The upgrade has been completed.',
                    type: 'success' as const,
                },
            };
        }

        const invoice = new Invoice({ currency_code: service.currency_code, status: Invoice.STATUS_PENDING, due_at: Carbon.now().addDays(7), user_id: service.user_id });
        await invoice.save();
        upgrade.invoice_id = invoice.id;
        await upgrade.save();

        const product = (await service.rel('product'))!;
        await invoice.relation('items').create({
            description: `Upgrade ${product.name} to ${upgradeProduct.name}`,
            price: price.price,
            quantity: 1,
            reference_id: upgrade.id,
            reference_type: 'App\\Models\\ServiceUpgrade',
        });

        return { redirect: route('invoices.show', invoice, false), flash: { message: 'The upgrade has been added to your cart. Please complete the payment to proceed.', type: 'success' as const } };
    });
}
