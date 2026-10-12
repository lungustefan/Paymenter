'use server';

import { action, flash, type ActionResult } from '@/server/action';
import { initRequest, requireUser } from '@/server/page';
import { validate } from '@/server/validation';
import { DisplayException } from '@/server/exceptions';
import { ExtensionHelper } from '@/server/extensions/helper';
import { BillingAgreement } from '@/server/models/BillingAgreement';
import { Service } from '@/server/models/Service';
import { ServiceCancellation } from '@/server/models/ServiceCancellation';
import { Product } from '@/server/models/Product';
import { route, relativeUrl } from '@/server/routes';
import { doUpgrade, upgradePlanFor, upgradeTotal } from '@/server/services/service-upgrade/UpgradeCheckout';
import { loadServiceActions } from '@/server/pages/services';

/** Actions of Livewire\Services\{Show,Cancel,Upgrade} */

async function ownedService(id: number): Promise<Service> {
    const user = await requireUser({ verified: true });
    const service = await Service.find<Service>(id);
    if (!service || service.user_id !== user.id) throw new DisplayException('Unauthorized');
    return service;
}

export async function updateLabelAction(serviceId: number, label: string | null): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        const service = await ownedService(serviceId);
        await validate({ label }, { label: 'nullable|string|max:255' }, { locale });
        service.label = label || null;
        await service.save();
        return { ok: true, notify: { message: 'Service label updated successfully', type: 'success' }, redirect: 'refresh' };
    });
}

export async function updateBillingAgreementAction(serviceId: number, ulid: string): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await requireUser({ verified: true });
        const service = await ownedService(serviceId);
        const agreement = await BillingAgreement.query().where('user_id', user.id).where('ulid', ulid).first();
        if (!agreement) throw new DisplayException('Unauthorized');
        service.billing_agreement_id = agreement.id;
        await service.save();
        return { ok: true, redirect: 'refresh' };
    });
}

export async function clearBillingAgreementAction(serviceId: number): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const service = await ownedService(serviceId);
        service.billing_agreement_id = null;
        await service.save();
        return { ok: true, redirect: 'refresh' };
    });
}

export async function cancelServiceAction(serviceId: number, input: { type: string; reason: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        const service = await ownedService(serviceId);
        await validate(input, { type: 'required|in:end_of_period,immediate', reason: 'required|max:255' }, { locale });

        if (!(await service.cancellable())) return { ok: false, notify: { message: 'This service cannot be cancelled', type: 'error' } };

        // Event hook will handle the cancellation (if its immediate or end of period)
        await ServiceCancellation.create({ service_id: service.id, type: input.type, reason: input.reason });
        await flash(tr.t('services.cancellation_requested'), 'success');
        return { ok: true, redirect: relativeUrl(route('services.show', service)) };
    });
}

/** `goto($function)`: run one of the server extension's button functions. */
export async function gotoAction(serviceId: number, fn: string): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const service = await ownedService(serviceId);
        const { buttons } = await loadServiceActions(service);
        // Check if function is allowed
        if (!buttons.map((b) => b.function).includes(fn)) return { ok: false, notify: { message: 'This action is not allowed', type: 'error' } };

        const result = await ExtensionHelper.callService(service, fn);
        if (typeof result === 'string') return { ok: true, redirect: result, hard: true };
        if (result && typeof result === 'object' && 'redirect' in result) return { ok: true, redirect: String((result as any).redirect), hard: true };
        return { ok: true };
    });
}

/** Total shown in the upgrade summary. */
export async function upgradeTotalAction(serviceId: number, upgradeProductId: number, configOptions: Record<string, any>): Promise<string> {
    await initRequest();
    const service = await ownedService(serviceId);
    const product = await Product.findOrFail<Product>(upgradeProductId);
    return String(await upgradeTotal(service, product, configOptions));
}

export async function upgradeAction(serviceId: number, upgradeProductId: number, configOptions: Record<string, any>): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        const user = await requireUser({ verified: true });
        const service = await ownedService(serviceId);
        if (!(await service.upgradable())) {
            await flash('This service is not upgradable.', 'error');
            return { ok: false, redirect: relativeUrl(route('services.show', service)) };
        }

        const upgradeProduct = await Product.findOrFail<Product>(upgradeProductId);
        // Validation
        const rules: Record<string, any> = {
            'upgradeProduct.id': [
                'required',
                async (_v: any, fail: (m: string) => void) => {
                    if (!(await upgradePlanFor(service, upgradeProduct))) fail('Invalid upgrade.');
                },
            ],
        };
        for (const option of await upgradeProduct.rel('upgradableConfigOptions')) {
            if (['text', 'number'].includes(option.type ?? '')) rules[`configOptions.${option.id}`] = ['required'];
            else if (option.type !== 'checkbox') rules[`configOptions.${option.id}`] = ['required', `in:${(await option.rel('children')).map((c) => c.id).join(',')}`];
        }
        await validate({ upgradeProduct: { id: upgradeProduct.id }, configOptions }, rules, { locale });

        try {
            const result = await doUpgrade(service.id as number, user.id as number, upgradeProduct, configOptions);
            if ('error' in result) return { ok: false, notify: { message: result.error, type: 'error' } };
            if (result.flash) await flash(result.flash.message, result.flash.type);
            return { ok: true, redirect: relativeUrl(result.redirect) };
        } catch (e) {
            if (e instanceof DisplayException) return { ok: false, notify: { message: e.message, type: 'error' } };
            console.error('[upgrade]', e);
            return { ok: false, notify: { message: 'An error occurred while processing your order. Please try again later.', type: 'success' } };
        }
    });
}
