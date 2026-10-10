import type { Service } from '@/server/models/Service';
import type { Product } from '@/server/models/Product';
import { setting } from '@/server/config';
import { storageUrl } from '@/server/routes';
import { makeTranslator } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { themeSetting } from '@/server/themes';
import { upgradeTotal } from '@/server/services/service-upgrade/UpgradeCheckout';
import type { CheckoutField } from '@/server/pages/checkout';
import { UpgradeForm, type UpgradeProduct } from './UpgradeForm';

/** Upgradable config options of a product, serialised the way the upgrade page displays them. */
async function upgradeOptions(product: Product, service: Service): Promise<CheckoutField[]> {
    const plan = (await service.rel('plan'))!;
    const out: CheckoutField[] = [];
    for (const option of await product.rel('upgradableConfigOptions')) {
        const children = await option.rel('children');
        let showPriceTag = false;
        for (const child of children) if (!(await child.price(null, plan.billing_period, plan.billing_unit)).is_free) showPriceTag = true;
        out.push({
            optionId: option.id as number,
            type: option.type as string,
            name: option.name as string,
            description: (option.description as string | null) ?? undefined,
            showPriceTag,
            // the original asks for `$service->billing_period` (which does not exist), i.e. the unfiltered price
            children: await Promise.all(
                children.map(async (child) => {
                    const p = await child.price();
                    return { id: child.id as number, name: child.name as string, prices: { '0': { label: String(p), available: p.available, free: p.is_free } } };
                }),
            ),
        });
    }
    return out;
}

/** Port of views/services/upgrade.blade.php */
export default async function Upgrade({ service }: { service: Service }) {
    const tr = makeTranslator(await getLocale());
    const t = tr.t;
    const plan = (await service.rel('plan'))!;
    const currentProduct = (await service.rel('product'))!;
    const upgrades = await service.productUpgrades();
    const all: Product[] = [currentProduct, ...(upgrades as Product[])];

    const serviceConfigs = await service.rel('configs');
    const current: Record<string, number> = {};
    for (const c of serviceConfigs) current[String(c.config_option_id)] = c.config_value_id as number;

    const products: UpgradeProduct[] = [];
    const initialConfigOptions: Record<string, Record<string, any>> = {};
    for (const product of all) {
        const isCurrent = product.id === currentProduct.id;
        const unit = tr.tChoice(t(`services.billing_cycles.${plan.billing_unit}`), plan.billing_period as number);
        const priceLabel =
            plan.type === 'recurring'
                ? t('services.price_every_period', {
                      price: String(await product.price(null, plan.billing_period, plan.billing_unit, service.currency_code)),
                      period: (plan.billing_period as number) > 1 ? plan.billing_period : '',
                      unit: isCurrent ? unit.toLowerCase() : unit,
                  })
                : t('services.price_one_time', { price: String(await product.price(null, null, null, service.currency_code)) });
        const options = await upgradeOptions(product, service);
        products.push({ id: product.id as number, name: product.name as string, image: product.image ? storageUrl(product.image) : null, description: (product.description as string) ?? '', priceLabel, options });

        const defaults: Record<string, any> = {};
        for (const option of await product.rel('upgradableConfigOptions')) {
            defaults[String(option.id)] = current[String(option.id)] ?? (await option.rel('children'))[0]?.id;
        }
        initialConfigOptions[String(product.id)] = defaults;
    }

    // We only have upgradable config options if the product has any
    const initialStep = upgrades.length === 0 ? 2 : 1;
    const initialTotal = String(await upgradeTotal(service, currentProduct, initialStep === 2 ? initialConfigOptions[String(currentProduct.id)] : {}));

    void setting;
    return (
        <UpgradeForm
            serviceId={service.id as number}
            serviceName={currentProduct.name as string}
            currentProductId={currentProduct.id as number}
            products={products}
            initialStep={initialStep}
            initialTotal={initialTotal}
            initialConfigOptions={initialConfigOptions}
            smallImages={!!themeSetting('small_images', false)}
        />
    );
}
