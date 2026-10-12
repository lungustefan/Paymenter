'use server';

import { redirect } from 'next/navigation';
import { action, type ActionResult } from '@/server/action';
import { initRequest } from '@/server/page';
import { Cart } from '@/server/cart';
import { findCategory } from '@/server/pages/products';
import { computePricing, getCheckoutConfigFields, pricingView, type PricingView } from '@/server/pages/checkout';
import { validate, type Rule } from '@/server/validation';
import { route, relativeUrl } from '@/server/routes';
import type { Product } from '@/server/models/Product';

/** Server side of Livewire\Products\Checkout (pricing refresh + `checkout()`). */

interface CheckoutInput {
    category: string;
    product: string;
    planId: number | string;
    configOptions: Record<string, any>;
    checkoutConfig: Record<string, any>;
    cartProductKey?: number | null;
}

async function loadProduct(input: CheckoutInput) {
    const category = await findCategory(input.category);
    const product = await category.relation<Product>('products').where('slug', input.product).firstOrFail();
    await product.load('plans.prices', 'configOptions.children.plans.prices');
    return product;
}

export async function pricingAction(input: Pick<CheckoutInput, 'category' | 'product' | 'planId' | 'configOptions'>): Promise<PricingView> {
    const { tr } = await initRequest();
    const product = await loadProduct(input as CheckoutInput);
    const plan = (await product.rel('plans')).find((p) => String(p.id) === String(input.planId));
    if (!plan) throw new Error('Plan not found');
    const total = await computePricing(product, plan, input.configOptions);
    return pricingView(total, plan, tr);
}

export async function addToCartAction(input: CheckoutInput): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        const product = await loadProduct(input);
        const options = await product.rel('configOptions');
        const checkoutFields = await getCheckoutConfigFields(product, input.checkoutConfig);

        // First we validate the plans
        const availablePlanIds = (await product.availablePlans()).map((p) => String(p.id));
        const rules: Record<string, any> = { plan_id: ['required', `in:${availablePlanIds.join(',')}`] };
        const attributes: Record<string, string> = {};
        for (const option of options) {
            attributes[`configOptions.${option.id}`] = option.name as string;
            if (['text', 'number'].includes(option.type ?? '')) rules[`configOptions.${option.id}`] = ['required'];
            else if (option.type === 'checkbox') {
                /* No validation needed for checkbox */
            } else rules[`configOptions.${option.id}`] = ['required', `in:${(await option.rel('children')).map((c) => c.id).join(',')}`];
        }
        for (const config of checkoutFields) {
            attributes[`checkoutConfig.${config.name}`] = config.label ?? config.name;
            const r: Rule[] = [];
            if (config.required) r.push('required');
            switch (config.type) {
                case 'text':
                case 'number':
                    r.push('string');
                    break;
                case 'select':
                case 'radio':
                    r.push(`in:${Object.keys(config.options ?? {}).join(',')}`);
                    break;
                case 'checkbox':
                    r.push('nullable', 'boolean');
                    break;
            }
            if (config.validation) r.push(...(Array.isArray(config.validation) ? config.validation : typeof config.validation === 'function' ? [config.validation] : String(config.validation).split('|')));
            if (r.length) rules[`checkoutConfig.${config.name}`] = r;
        }
        await validate({ plan_id: input.planId, configOptions: input.configOptions, checkoutConfig: input.checkoutConfig }, rules, { locale, attributes });

        const plan = (await product.rel('plans')).find((p) => String(p.id) === String(input.planId))!;

        // Has this product quantity = no?
        if (product.allow_quantity === 'disabled') {
            const items = await Cart.items();
            if (items.some((i) => i.product_id === product.id && (!input.cartProductKey || i.id !== input.cartProductKey))) {
                return { ok: false, notify: { message: 'This product is already in your cart and cannot be added again.', type: 'error' } };
            }
        }

        // Change configOptions so they also contain the name of the option (resulting in less database calls = faster speeds)
        const configOptions: Record<string, unknown>[] = [];
        for (const option of options) {
            const children = await option.rel('children');
            const value = input.configOptions[String(option.id)];
            const base = { option_id: option.id, option_name: option.name, option_type: option.type, option_env_variable: option.env_variable };
            if (option.type === 'checkbox') {
                const checked = value === true || value === 'true';
                configOptions.push({ ...base, value: checked ? children[0].id : null, value_name: checked ? 'Yes' : 'No' });
            } else if (['text', 'number'].includes(option.type ?? '')) {
                configOptions.push({ ...base, value, value_name: value });
            } else {
                configOptions.push({ ...base, value, value_name: children.find((c) => String(c.id) === String(value))?.name });
            }
        }

        // Ensure checkout config has only the allowed keys and values
        const checkoutConfig: Record<string, unknown> = {};
        for (const config of checkoutFields) checkoutConfig[config.name] = input.checkoutConfig[config.name] ?? null;

        await Cart.add(product, plan, configOptions, checkoutConfig, 1, input.cartProductKey ?? null);
        return { ok: true, redirect: relativeUrl(route('cart')) };
    });
}

void redirect;
