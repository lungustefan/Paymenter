import { notFound, redirect } from 'next/navigation';
import { once } from '@/server/request-store';
import { Cart } from '@/server/cart';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Price } from '@/server/classes/Price';
import { Settings } from '@/server/classes/Settings';
import { route, relativeUrl } from '@/server/routes';
import { findCategory } from '@/server/pages/products';
import type { Product } from '@/server/models/Product';
import type { Plan } from '@/server/models/Plan';
import type { ConfigOption } from '@/server/models/ConfigOption';
import type { Translator } from '@/server/i18n';

/** Shared pieces of Livewire\Products\Checkout (page state, pricing, serialisable form definition). */

export interface CheckoutState {
    plan_id: number;
    configOptions: Record<string, any>;
    checkoutConfig: Record<string, any>;
}

export interface CheckoutQuery {
    plan?: string;
    options: Record<string, string>;
    config: Record<string, string>;
    edit?: string;
}

/** Livewire `#[Url]` bindings: `plan`, `options[id]`, `config[name]`, `edit`. */
export function parseCheckoutQuery(search: Record<string, string | string[] | undefined>): CheckoutQuery {
    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const out: CheckoutQuery = { plan: first(search.plan), options: {}, config: {}, edit: first(search.edit) };
    for (const [key, value] of Object.entries(search)) {
        const o = /^options\[(.+)\]$/.exec(key);
        if (o) out.options[o[1]] = first(value) ?? '';
        const c = /^config\[(.+)\]$/.exec(key);
        if (c) out.config[c[1]] = first(value) ?? '';
    }
    return out;
}

export interface PricingView {
    subtotal: string;
    total: string;
    totalTax: string;
    hasTax: boolean;
    taxName: string;
    taxRate: string;
    showThen: boolean;
    thenLabel: string;
    thenPrice: string;
}

/** `updatePricing()` */
export async function computePricing(product: Product, plan: Plan, configOptions: Record<string, any>): Promise<Price> {
    const planPrice = await plan.price();
    let total = planPrice.price;
    let setupFee = planPrice.setup_fee ?? 0;

    for (const option of await product.rel('configOptions')) {
        const children = await option.rel('children');
        // Check if checkbox is set, if so, add price if checked
        if (option.type === 'checkbox' && configOptions[String(option.id)]) {
            const p = children[0] ? await children[0].price(null, plan.billing_period, plan.billing_unit) : null;
            total += p?.price ?? 0;
            setupFee += p?.setup_fee ?? 0;
            continue;
        }
        // Skip text, number and checkbox types as they have no price
        if (['text', 'number', 'checkbox'].includes(option.type ?? '')) continue;

        const chosen = children.find((c) => String(c.id) === String(configOptions[String(option.id)]));
        const p = chosen ? await chosen.price(null, plan.billing_period, plan.billing_unit) : null;
        total += p?.price ?? 0;
        setupFee += p?.setup_fee ?? 0;
    }

    return Price.make({ price: total, currency: planPrice.currency, setup_fee: setupFee }, { apply_exclusive_tax: true });
}

export async function pricingView(total: Price, plan: Plan, tr: Translator): Promise<PricingView> {
    const tax = await Settings.tax();
    const showThen = Number(total.setup_fee ?? 0) > 0 && plan.type === 'recurring';
    return {
        subtotal: total.format(total.subtotal),
        total: String(total),
        totalTax: total.formatted.total_tax,
        hasTax: Number(total.total_tax) > 0,
        taxName: (tax?.name as string) ?? '',
        taxRate: String(tax?.rate ?? ''),
        showThen,
        thenLabel: showThen
            ? tr.t('product.then_after_x', { time: `${plan.billing_period} ${tr.tChoice(tr.t(`services.billing_cycles.${plan.billing_unit}`), plan.billing_period as number)}` })
            : '',
        thenPrice: total.format(total.price),
    };
}

export interface CheckoutField {
    type: string;
    name: string;
    label?: string;
    required?: boolean;
    multiple?: boolean;
    placeholder?: string;
    default?: any;
    description?: string;
    link?: string;
    validation?: string | string[];
    options?: Record<string, string>;
    /** config option children, with their price label per plan id */
    children?: { id: number; name: string; prices: Record<string, { label: string; available: boolean; free: boolean }> }[];
    /** id of the config option (only for product config options) */
    optionId?: number;
}

export async function getCheckoutConfigFields(product: Product, values: Record<string, any>): Promise<any[]> {
    return ExtensionHelper.getCheckoutConfig(product, values);
}

/** Config options of the product, serialised with the price label of every child for every plan. */
export async function serializeConfigOptions(product: Product, plans: Plan[]): Promise<CheckoutField[]> {
    const out: CheckoutField[] = [];
    for (const option of await product.rel('configOptions')) {
        const children = await option.rel('children');
        out.push({
            optionId: option.id as number,
            type: option.type as string,
            name: option.name as string,
            description: (option.description as string | null) ?? undefined,
            children: await Promise.all(
                children.map(async (child) => {
                    const prices: Record<string, { label: string; available: boolean; free: boolean }> = {};
                    for (const plan of plans) {
                        const p = await child.price(null, plan.billing_period, plan.billing_unit);
                        prices[String(plan.id)] = { label: String(p), available: p.available, free: p.is_free };
                    }
                    return { id: child.id as number, name: child.name as string, prices };
                }),
            ),
        });
    }
    return out;
}

/** Component `mount()`: resolve the initial plan / options / config from the URL or the cart item being edited. */
export function loadCheckout(categorySlug: string, productSlug: string, query: CheckoutQuery) {
    return once(`pages:checkout:${categorySlug}/${productSlug}:${JSON.stringify(query)}`, async () => {
        const category = await findCategory(categorySlug);
        const product = await category.relation<Product>('products').where('slug', productSlug).first();
        if (!product) notFound();
        await product.load('plans.prices', 'configOptions.children.plans.prices');

        const price = await product.price();
        if (product.stock === 0 || !price.available) {
            redirect(relativeUrl(route('products.show', { category: category.slug, product: product.slug })));
        }

        const plans = await product.rel('plans');
        const configOptions = await product.rel('configOptions');

        let plan: Plan | undefined;
        let optionState: Record<string, any> = {};
        let checkoutConfig: Record<string, any> = {};
        let cartProductKey: number | null = null;

        // Is there an existing item in the cart?
        const cartItems = await Cart.items();
        const existing = query.edit ? cartItems.find((i) => String(i.id) === String(query.edit)) : undefined;
        if (existing && existing.product_id === product.id) {
            cartProductKey = existing.id as number;
            plan = await existing.rel('plan');
            for (const o of (existing.config_options as any[]) ?? []) optionState[String(o.option_id)] = o.value;
            // Update config options for checkbox types
            for (const option of configOptions.filter((o) => o.type === 'checkbox')) {
                optionState[String(option.id)] = optionState[String(option.id)] !== undefined && optionState[String(option.id)] !== null;
            }
            checkoutConfig = { ...((existing.checkout_config as Record<string, any>) ?? {}) };
        } else {
            // Set the first plan as default
            plan = query.plan ? plans.find((p) => String(p.id) === String(query.plan)) : plans[0];
            if (!plan) notFound();

            // Prepare the config options
            for (const option of configOptions) {
                const key = String(option.id);
                const given = query.options[key];
                if (['text', 'number'].includes(option.type ?? '')) optionState[key] = given ?? null;
                else if (option.type === 'checkbox') optionState[key] = given !== undefined && ['true', '1'].includes(given);
                else optionState[key] = given ?? (await option.rel('children'))[0]?.id;
            }
            checkoutConfig = { ...query.config };
            for (const field of await getCheckoutConfigFields(product, checkoutConfig)) {
                if (['select', 'radio'].includes(field.type)) {
                    checkoutConfig[field.name] = checkoutConfig[field.name] ?? field.default ?? Object.keys(field.options ?? {})[0];
                } else {
                    checkoutConfig[field.name] = checkoutConfig[field.name] ?? field.default ?? null;
                }
            }
        }

        const fields = await getCheckoutConfigFields(product, checkoutConfig);
        return { category, product, plans, plan: plan!, configOptions, optionState, checkoutConfig, fields, cartProductKey };
    });
}

export type LoadedCheckout = Awaited<ReturnType<typeof loadCheckout>>;

export function optionById(options: ConfigOption[], id: string | number) {
    return options.find((o) => String(o.id) === String(id));
}
