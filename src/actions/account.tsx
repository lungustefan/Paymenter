'use server';

import { redirect } from 'next/navigation';
import { action, type ActionResult } from '@/server/action';
import { disabledIf, initRequest, requireUser } from '@/server/page';
import { validate, ValidationError } from '@/server/validation';
import { checkPassword, hashPassword } from '@/server/lib/crypto';
import { sessionGet } from '@/server/session';
import { config, setting } from '@/server/config';
import { Settings } from '@/server/classes/Settings';
import { DisplayException } from '@/server/exceptions';
import { transaction } from '@/server/orm';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { ExtensionHelper } from '@/server/extensions/helper';
import { createSecret, qrCodeDataUri, verifyCode } from '@/server/auth/tfa';
import { initializeProperties, rulesForProperties, attributesForProperties, updateProperties } from '@/server/support/properties';
import { isAllowedPushEndpoint } from '@/server/support/push-endpoint';
import { storageUrl, route, relativeUrl } from '@/server/routes';
import { sessionPut } from '@/server/session';
import { Carbon } from '@/server/lib/carbon';
import { UserSession } from '@/server/models/UserSession';
import { Gateway } from '@/server/models/Gateway';
import { Invoice } from '@/server/models/Invoice';
import { NotificationTemplate } from '@/server/models/NotificationTemplate';
import { BillingAgreement } from '@/server/models/BillingAgreement';

/** Actions of Livewire\Client\{Account,Security,Credits,PaymentMethods,Notifications} */

export async function updateAccountAction(input: Record<string, any>): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        const user = await requireUser();
        const { customProperties } = await initializeProperties(user, 'App\\Models\\User');

        const validated = await validate(
            input,
            {
                first_name: 'required|string|max:255',
                last_name: 'required|string|max:255',
                email: `required|email|max:255|unique:users,email,${user.id}`,
                ...rulesForProperties(customProperties),
            },
            { locale, attributes: attributesForProperties(customProperties) },
        );

        const { properties, ...fields } = validated;
        await user.update(fields);

        // If email was changed, we should mark it as unverified and send a new verification email
        if (user.wasChanged('email')) {
            user.email_verified_at = null;
            await user.save();
            await NotificationHelper.emailVerificationNotification(user);
        }
        if (properties) await updateProperties(user, properties, customProperties);

        return { ok: true, notify: { message: 'Account updated successfully.', type: 'success' }, redirect: 'refresh' };
    });
}

/* ------------------------------ security ------------------------------ */

async function destroyOtherSessions(userId: number) {
    const current = await sessionGet<string | null>('user_session', null);
    const q = UserSession.query().where('user_id', userId);
    if (current) q.where('ulid', '!=', current);
    await q.delete();
}

export async function changePasswordAction(input: { current_password: string; password: string; password_confirmation: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        const user = await requireUser();
        await validate(input, { current_password: 'required|string', password: 'required|string|min:8|confirmed' }, { locale });

        if (!checkPassword(input.current_password, user.password as string)) return { ok: false, notify: { message: tr.t('account.notifications.password_incorrect'), type: 'error' } };

        await user.update({ password: hashPassword(input.password) });
        await destroyOtherSessions(user.id as number);
        return { ok: true, notify: { message: tr.t('account.notifications.password_changed'), type: 'success' }, data: { reset: true } };
    });
}

export async function startTwoFactorAction(): Promise<ActionResult<{ secret: string; image: string }>> {
    return action(async () => {
        await initRequest();
        const user = await requireUser();
        const secret = createSecret();
        return { ok: true, data: { secret, image: await qrCodeDataUri(user.email as string, secret) } };
    });
}

export async function enableTwoFactorAction(input: { secret: string; code: string }): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        const user = await requireUser();
        await validate({ twoFactorCode: input.code }, { twoFactorCode: 'required|string' }, { locale, attributes: { twoFactorCode: 'two factor code' } });
        if (!verifyCode(input.secret, input.code)) return { ok: false, notify: { message: tr.t('account.notifications.two_factor_code_incorrect'), type: 'error' } };

        await user.update({ tfa_secret: input.secret });
        // Destroy all other sessions
        await destroyOtherSessions(user.id as number);
        return { ok: true, notify: { message: tr.t('account.notifications.two_factor_enabled'), type: 'success' }, redirect: 'refresh' };
    });
}

export async function disableTwoFactorAction(): Promise<ActionResult> {
    return action(async () => {
        const { tr } = await initRequest();
        const user = await requireUser();
        await user.update({ tfa_secret: null });
        return { ok: true, notify: { message: tr.t('account.notifications.two_factor_disabled'), type: 'success' }, redirect: 'refresh' };
    });
}

export async function logoutSessionAction(sessionId: number): Promise<ActionResult> {
    return action(async () => {
        const { tr } = await initRequest();
        const user = await requireUser();
        const session = await UserSession.find<UserSession>(sessionId);
        if (!session || session.user_id !== user.id) return { ok: false, notify: { message: 'Unauthorized', type: 'error' } };
        await session.delete();
        return { ok: true, notify: { message: tr.t('account.notifications.session_logged_out'), type: 'success' }, redirect: 'refresh' };
    });
}

/* ------------------------------ credits ------------------------------ */

export async function creditGatewaysAction(amount: number | string, currency: string) {
    await initRequest();
    await requireUser();
    const gateways = await ExtensionHelper.getCheckoutGateways(Number(amount), currency, 'credits');
    return gateways.map((g) => ({ id: g.id as number, name: g.name as string }));
}

export async function addCreditAction(input: { currency: string; amount: string | number; gateway: string | number | null }): Promise<ActionResult> {
    return action(async () => {
        const { locale } = await initRequest();
        await disabledIf('credits_enabled', false, true);
        const user = await requireUser();
        const gateways = await ExtensionHelper.getCheckoutGateways(Number(input.amount), input.currency, 'credits');

        await validate(
            input,
            {
                currency: 'required|exists:currencies,code',
                amount: `required|numeric|min:${setting('credits_minimum_deposit')}|max:${setting('credits_maximum_deposit')}`,
                gateway: `required|in:${gateways.map((g) => g.id).join(',')}`,
            },
            { locale },
        );

        const amount = Number(input.amount);
        const invoice = await transaction(async () => {
            // Lock the user's invoices and credits
            await user.relation('invoices').lockForUpdate().get();
            const credits = await user.relation('credits').where('currency_code', input.currency).lockForUpdate().get();
            // Check if the current credits + the new credits exceed the maximum credits allowed
            if (credits.length > 0 && credits.reduce((s, c) => s + Number(c.amount), 0) + amount > Number(setting('credits_maximum_credit'))) {
                throw new DisplayException('You cannot exceed the maximum credits allowed.');
            }
            // Check if the user has any unpaid invoice items referencing credits
            const unpaid = await user.relation<Invoice>('invoices').where('status', Invoice.STATUS_PENDING).whereHas('items', (q) => q.where('reference_type', 'App\\Models\\Credit')).exists();
            if (unpaid) throw new DisplayException('You have an unpaid invoice for credits. Please pay the invoice before adding more credits.');

            const created = await Invoice.create({ user_id: user.id, currency_code: input.currency, due_at: Carbon.now() });
            await created.relation('items').create({
                description: (await import('@/server/i18n')).t('account.credit_deposit', { currency: input.currency }, locale),
                quantity: 1,
                price: amount,
                reference_type: 'App\\Models\\Credit',
            });
            return created;
        });

        await sessionPut('gateway', input.gateway);
        // Pay it right away when the gateway only needs a redirect
        if (input.gateway) {
            const gateway = await Gateway.query().where('id', input.gateway).first();
            const pay = await ExtensionHelper.pay(gateway!, (await invoice.fresh())!);
            if (typeof pay === 'string') return { ok: true, redirect: pay, hard: true };
        }
        return { ok: true, redirect: `${relativeUrl(route('invoices.show', invoice))}?gateway=${input.gateway}&pay=true` };
    });
}

/* ------------------------------ payment methods ------------------------------ */

export async function createBillingAgreementAction(gatewayId: number | string | null): Promise<ActionResult> {
    return action(async () => {
        const { locale, tr } = await initRequest();
        const user = await requireUser();
        await validate({ gateway: gatewayId }, { gateway: 'required' }, { locale });
        const gateways = await ExtensionHelper.getBillingAgreementGateways();
        if (!gateways.map((g) => String(g.id)).includes(String(gatewayId))) throw new ValidationError({ gateway: [tr.t('account.invalid_payment_gateway')] });

        const gateway = await Gateway.find<Gateway>(Number(gatewayId));
        const setup = await ExtensionHelper.createBillingAgreement(user, gateway!);
        // If setup is a string, it's a URL to redirect to
        if (typeof setup === 'string') return { ok: true, redirect: setup, hard: true };
        if (setup && typeof setup === 'object' && 'redirect' in (setup as any)) return { ok: true, redirect: String((setup as any).redirect), hard: true };
        return { ok: true, view: (setup as any)?.html ? <div dangerouslySetInnerHTML={{ __html: String((setup as any).html) }} /> : (setup as any) };
    });
}

export async function removePaymentMethodAction(ulid: string): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await requireUser();
        const agreement = await BillingAgreement.query().where('user_id', user.id).where('ulid', ulid).first();
        if (!agreement) return { ok: false, notify: { message: 'Billing agreement not found', type: 'error' } };

        // Call the gateway to cancel the billing agreement if supported
        const succeeded = await ExtensionHelper.cancelBillingAgreement(agreement);
        if (succeeded) {
            await agreement.delete();
            return { ok: true, notify: { message: 'Payment method removed successfully', type: 'success' }, redirect: 'refresh' };
        }
        return { ok: false, notify: { message: 'Failed to remove payment method', type: 'error' } };
    });
}

/* ------------------------------ notifications ------------------------------ */

export async function savePreferencesAction(preferences: Record<string, { mail_enabled: boolean; in_app_enabled: boolean }>): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await requireUser();
        const templates = await NotificationTemplate.query().where('enabled', true).get();
        for (const template of templates) {
            // Check if allowed to change
            if (!(template.isEmailUserControllable() || template.isInAppUserControllable())) continue;
            const pref = preferences[template.key as string];
            if (!pref) continue;
            await user.relation('notificationsPreferences').updateOrCreate(
                { notification_template_id: template.id },
                { mail_enabled: !!pref.mail_enabled, in_app_enabled: !!pref.in_app_enabled },
            );
        }
        return { ok: true, notify: { message: 'Notification preferences updated successfully.', type: 'success' } };
    });
}

export async function storePushSubscriptionAction(subscriptionJson: string): Promise<ActionResult> {
    return action(async () => {
        await initRequest();
        const user = await requireUser();
        let subscription: any = null;
        try {
            subscription = JSON.parse(subscriptionJson);
        } catch {
            /* handled below */
        }
        if (!subscription || typeof subscription !== 'object' || typeof subscription.endpoint !== 'string' || !isAllowedPushEndpoint(subscription.endpoint)) {
            throw new ValidationError({ subscription: ['The push subscription endpoint is not allowed.'] });
        }

        const pushSubscription = await user.relation('pushSubscriptions').updateOrCreate(
            { endpoint: subscription.endpoint },
            { p256dh_key: subscription.keys?.p256dh, auth_key: subscription.keys?.auth },
        );

        const notes: ActionResult['notify'][] = [{ message: 'Push subscription saved successfully.', type: 'success' }];
        try {
            const webpush = (await import('web-push')).default;
            webpush.setVapidDetails(config('app.url'), setting('vapid_public_key'), setting('vapid_private_key'));
            const logo = storageUrl(setting('logo'));
            await webpush.sendNotification(
                (pushSubscription as any).subscription(),
                JSON.stringify({
                    title: 'Push Notifications Enabled!',
                    body: `You will now receive push notifications from ${config('app.name')}`,
                    icon: logo,
                    badge: logo,
                    show_in_app: false,
                    // This forces it to be a push notification only
                    show_as_push: true,
                    data: { url: config('app.url') },
                }),
            );
            notes.push({ message: 'Test push notification sent successfully. Please check your device.', type: 'success' });
        } catch (e: any) {
            notes.push({ message: `Failed to send test push notification: ${e?.message ?? e}`, type: 'error' });
        }
        return { ok: true, notify: notes[notes.length - 1], data: { notes } };
    });
}

void redirect;
void Settings;
