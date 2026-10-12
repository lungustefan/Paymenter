import { createHmac, timingSafeEqual } from 'node:crypto';
import { Gateway } from '@/server/extensions/Gateway';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { redirectWithNotification } from '@/server/extensions/response';
import { adminNotification } from '@/server/admin/notifications';
import { getCurrentUser } from '@/server/auth/session';
import { Events } from '@/server/event-defs';
import { listen } from '@/server/events';
import { DisplayException } from '@/server/exceptions';
import { Http, RequestException } from '@/server/http';
import { t } from '@/server/i18n';
import { Carbon } from '@/server/lib/carbon';
import { ucfirst } from '@/server/lib/php';
import { registerRoute, route, routeTable } from '@/server/routes';
import type { BillingAgreement } from '@/server/models/BillingAgreement';
import type { Extension as ExtensionModel } from '@/server/models/Extension';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { Service } from '@/server/models/Service';
import { User } from '@/server/models/User';
import StripeElements from './StripeElements';

const abort = (status: number, message = '') => new Response(message, { status });

const hasStripeSubscription = async (service: Service) => (await service.rel('properties')).find((p) => p.key === 'has_stripe_subscription');

export default class Stripe extends Gateway {
    static meta = {
        name: 'Stripe Gateway',
        description: 'Accept payments via Stripe.',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/stripe',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgZmlsbD0iIzUzM0FGRCIvPjxwYXRoIGQ9Ik0xMjAgMzkyTDM5MiAzMzRWMTEyTDEyMCAxNz hWMzk yWiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==',
    };

    private static readonly API_VERSION = '2025-07-30.basil';

    boot() {
        // Register the listeners once per process (the extension is re-booted when its settings change)
        if ((Stripe as any).listening) return;
        (Stripe as any).listening = true;

        listen(Events.Service.Updated, async ({ service }) => {
            if ((await hasStripeSubscription(service))?.value !== '1' || !service.subscription_id) {
                // If the service is not a stripe subscription, skip
                return;
            }
            const stripe = await ExtensionHelper.freshInstance<Stripe>('gateway', 'Stripe');
            if (service.isDirty('price') || service.isDirty('expires_at')) {
                try {
                    await stripe.updateSubscription(service);
                } catch {
                    /* ignored */
                }
            }
            // Check if the service is canceled
            if (service.isDirty('status') && service.status === Service.STATUS_CANCELLED) {
                try {
                    await stripe.cancelSubscription(service);
                } catch {
                    // Ignore exception
                }
            }
        });

        listen(Events.ServiceCancellation.Created, async ({ cancellation }) => {
            const service = (await cancellation.rel('service'))!;
            if ((await hasStripeSubscription(service))?.value !== '1' || !service.subscription_id) {
                // If the service is not a stripe subscription, skip
                return;
            }
            try {
                await (await ExtensionHelper.freshInstance<Stripe>('gateway', 'Stripe')).cancelSubscription(service);
            } catch {
                // Ignore exception
            }
        });
    }

    routes(): ExtensionRoute[] {
        return [
            {
                name: 'extensions.gateways.stripe.webhook',
                method: 'POST',
                path: '/extensions/stripe/webhook',
                async handler(ctx) {
                    return (await ctx.instance<Stripe>()).webhook(await ctx.text(), ctx.request.headers.get('Stripe-Signature'));
                },
            },
            {
                name: 'extensions.gateways.stripe.setup-agreement',
                method: 'GET',
                path: '/extensions/stripe/setup-agreement',
                auth: true,
                async handler(ctx) {
                    return (await ctx.instance<Stripe>()).setupAgreement(ctx.user!, await ctx.all(), ctx.request.headers.get('referer'));
                },
            },
        ];
    }

    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'stripe_secret_key',
                label: 'Stripe Restricted key',
                placeholder: 'Enter your Stripe Restricted API key',
                type: 'text',
                encrypted: true,
                description: 'Find your API keys at https://dashboard.stripe.com/apikeys',
                required: true,
            },
            {
                name: 'stripe_publishable_key',
                label: 'Stripe Publishable Key',
                placeholder: 'Enter your Stripe Publishable API key',
                type: 'text',
                description: 'Find your API keys at https://dashboard.stripe.com/apikeys',
                required: true,
            },
            {
                name: 'stripe_create_customers',
                label: 'Create detailed Stripe customers',
                type: 'checkbox',
                description:
                    'Controls the level of detail for Stripe customers. When enabled, customers include full address, phone, and company details. When disabled, customers include only basic information (name, email, user ID). Applies to both one-time payments and billing agreements.',
                required: false,
            },
            {
                name: 'stripe_webhook_secret',
                label: 'Stripe webhook secret (auto generated)',
                type: 'text',
                encrypted: true,
                description: 'Stripe webhook secret',
                required: false,
            },
        ];
    }

    async enabled(gateway: ExtensionModel) {
        await this.updated(gateway);
    }

    async updated(gateway: ExtensionModel) {
        if ((await gateway.relation('settings').where('key', 'stripe_webhook_secret').first())?.value) {
            return;
        }

        // If the extension isn't enabled, try to boot it
        if (!('extensions.gateways.stripe.webhook' in routeTable)) {
            registerRoute('extensions.gateways.stripe.webhook', '/extensions/stripe/webhook');
            registerRoute('extensions.gateways.stripe.setup-agreement', '/extensions/stripe/setup-agreement');
        }

        // Check if webhook already exists
        const webhooks = await this.request('get', '/webhook_endpoints');
        for (const webhook of webhooks.data) {
            if (webhook.url === route('extensions.gateways.stripe.webhook')) {
                // Delete webhook
                await this.request('delete', '/webhook_endpoints/' + webhook.id);
                break;
            }
        }

        // Create webhook on stripe
        const webhook = await this.request('post', '/webhook_endpoints', {
            url: route('extensions.gateways.stripe.webhook'),
            description: 'Paymenter Stripe Webhook',
            enabled_events: [
                'payment_intent.succeeded',
                'payment_intent.payment_failed',
                'payment_intent.processing',
                'setup_intent.succeeded',
                'subscription_schedule.canceled',
                'invoice.created',
                'invoice.payment_succeeded',
                'charge.updated',
            ],
            api_version: Stripe.API_VERSION,
        });

        await gateway.relation('settings').updateOrCreate({ key: 'stripe_webhook_secret' }, { value: webhook.secret });

        await adminNotification.success('Webhook created', "We've created a webhook for you on Stripe (refresh the page to see the secret)");
    }

    private async request(method: string, url: string, data: Record<string, any> = {}): Promise<any> {
        const response = await (
            Http.withHeaders({
                Authorization: 'Bearer ' + this.config('stripe_secret_key'),
                'Stripe-Version': Stripe.API_VERSION,
            }).asForm() as any
        )[method.toLowerCase()]('https://api.stripe.com/v1' + url, data);
        return response.throw().object();
    }

    async pay(invoice: Invoice, total: number) {
        const intentData: Record<string, any> = {
            description: t('invoices.payment_for_invoice', { number: invoice.number ?? invoice.id }),
            amount: total * 100,
            currency: invoice.currency_code,
            automatic_payment_methods: { enabled: 'true' },
            metadata: { invoice_id: invoice.id },
        };

        try {
            const includeDetails = Boolean(this.config('stripe_create_customers'));
            const customer = await this.createOrGetStripeCustomer((await invoice.rel('user'))!, includeDetails);
            if (customer.id) {
                intentData.customer = customer.id;
            }
        } catch {
            // ignore customer creation errors and continue without customer
        }

        const intent = await this.request('post', '/payment_intents', intentData);

        // Pay the invoice using Stripe
        const user = (await getCurrentUser())!;
        return (
            <StripeElements
                mode="payment"
                publishableKey={this.config<string>('stripe_publishable_key') as string}
                clientSecret={intent.client_secret}
                name={await user.name()}
                email={user.email as string}
                returnUrl={route('invoices.show', invoice) + '?checkPayment=true'}
            />
        );
    }

    async webhook(content: string, signature: string | null) {
        if (!this.isValidSignature(content, signature, this.config('stripe_webhook_secret'))) {
            return Response.json({ error: 'Invalid signature' }, { status: 400 });
        }

        const event = JSON.parse(content);

        // Handle the event
        switch (event.type) {
            case 'payment_intent.processing': {
                const paymentIntent = event.data.object; // contains a StripePaymentIntent
                if (paymentIntent.metadata?.invoice_id === undefined) {
                    break;
                }
                await ExtensionHelper.addProcessingPayment(paymentIntent.metadata.invoice_id, 'Stripe', paymentIntent.amount / 100, null, paymentIntent.id);
                break;
            }
            // Normal payment
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object; // contains a StripePaymentIntent
                if (paymentIntent.metadata?.invoice_id === undefined) {
                    break;
                }
                await ExtensionHelper.addPayment(paymentIntent.metadata.invoice_id, 'Stripe', paymentIntent.amount / 100, null, paymentIntent.id);
                break;
            }
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object; // contains a StripePaymentIntent
                if (paymentIntent.metadata?.invoice_id === undefined) {
                    break;
                }
                await ExtensionHelper.addFailedPayment(paymentIntent.metadata.invoice_id, 'Stripe', paymentIntent.amount / 100, null, paymentIntent.id);
                break;
            }
            case 'charge.updated': {
                const charge = event.data.object; // contains a StripeCharge
                const invoiceTransaction = await InvoiceTransaction.query().where('transaction_id', charge.payment_intent).first();
                if (!invoiceTransaction) {
                    break;
                }
                // Get fee from charge
                let fee = 0;
                if (charge.balance_transaction) {
                    const balanceTransaction = await this.request('get', '/balance_transactions/' + charge.balance_transaction);
                    fee = balanceTransaction.fee / 100;
                }
                await ExtensionHelper.addPaymentFee(charge.payment_intent, fee);

                break;
            }
            case 'setup_intent.succeeded': {
                const setupIntent = event.data.object; // contains a StripeSetupIntent
                // If it's a billing agreement, call setupBillingAgreement
                if (setupIntent.metadata?.is_billing_agreement === undefined || setupIntent.metadata.is_billing_agreement !== '1') {
                    await this.setupSubscription(setupIntent);
                } else {
                    await this.setupBillingAgreement(setupIntent);
                }
                break;
            }
            case 'subscription_schedule.canceled': {
                const subscriptionSchedule = event.data.object; // contains a StripeSubscriptionSchedule
                const service = await Service.query().where('subscription_id', subscriptionSchedule.id).first();
                if (service) {
                    await service.update({ subscription_id: null });
                }
                break;
            }
            case 'invoice.created': {
                const invoice = event.data.object; // contains a StripeInvoice

                if (this.config('stripe_use_subscriptions') !== true) {
                    break;
                }

                // Check if its draft and does exist in our database
                if (invoice.status === 'draft' && invoice.parent.type === 'subscription_details') {
                    const service = await Service.query().where('subscription_id', invoice.parent.subscription_details.subscription).first();

                    if (service) {
                        await this.request('post', '/invoices/' + invoice.id + '/finalize');
                        // Pay the invoice using Stripe
                        await this.request('post', '/invoices/' + invoice.id + '/pay');
                    }
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                // Mark invoice as paid
                const invoice = event.data.object; // contains a StripeInvoice

                if (invoice.parent.type !== 'subscription_details') {
                    break;
                }

                const service = await Service.query().where('subscription_id', invoice.parent.subscription_details.subscription).first();
                if (service) {
                    const items = [...(await service.rel('invoiceItems'))].sort((a, b) => Number((b.created_at as any)?.timestamp ?? 0) - Number((a.created_at as any)?.timestamp ?? 0));
                    const invoiceModel = (await items[0].rel('invoice'))!;
                    const paymentIntents = await this.request('get', '/invoice_payments', { invoice: invoice.id });
                    const paymentIntent = paymentIntents.data[0];

                    if (paymentIntent.payment.type !== 'payment_intent') {
                        break;
                    }

                    await ExtensionHelper.addPayment(invoiceModel.id as number, 'Stripe', invoice.amount_paid / 100, null, paymentIntent.payment.payment_intent);
                }
                break;
            }
            default:
            // Not a event type we care about, just return 200
        }

        return new Response(null, { status: 200 });
    }

    private async setupSubscription(setupIntent: any) {
        const invoice = await Invoice.findOrFail<Invoice>(setupIntent.metadata.invoice_id);
        const user = (await invoice.rel('user'))!;
        const stripeCustomerId = (await user.rel('properties')).find((p) => p.key === 'stripe_id');
        // Create customer if not exists
        if (!stripeCustomerId) {
            throw new Error('Stripe customer not found');
        }
        const customer = await this.request('get', '/customers/' + stripeCustomerId.value);

        // Make payment method default
        await this.request('post', '/customers/' + customer.id, {
            invoice_settings: { default_payment_method: setupIntent.payment_method },
        });

        // Create subscription
        for (const item of await invoice.rel('items')) {
            if (item.reference_type !== 'App\\Models\\Service') {
                continue;
            }
            const service = (await item.rel('reference')) as Service;
            const product = (await service.rel('product'))!;

            // Check if the service->product already exists in Stripe
            let stripeProduct = await this.request('get', '/products/search', { query: `metadata['product_id']:'${product.id}'` });

            if (!stripeProduct.data?.length) {
                // Create product
                stripeProduct = await this.request('post', '/products', {
                    name: product.name,
                    metadata: { product_id: product.id },
                });
            } else {
                stripeProduct = stripeProduct.data[0];
            }

            const plan = (await service.rel('plan'))!;
            const phases: any[] = [];
            // Check if current invoice item price is bigger then service price (then we have a setup fee)
            if (Number(item.price) !== Number(service.price)) {
                phases.push({
                    items: [
                        {
                            price_data: {
                                currency: invoice.currency_code,
                                product: stripeProduct.id,
                                unit_amount: Number(item.price) * 100,
                                recurring: {
                                    interval: plan.billing_unit,
                                    interval_count: plan.billing_period,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    iterations: 1,
                    metadata: {
                        service_id: service.id,
                    },
                    proration_behavior: 'none',
                });
            }
            phases.push({
                items: [
                    {
                        price_data: {
                            currency: invoice.currency_code,
                            product: stripeProduct.id,
                            unit_amount: Number(service.price) * Number(service.quantity) * 100,
                            recurring: {
                                interval: plan.billing_unit,
                                interval_count: plan.billing_period,
                            },
                        },
                        quantity: 1,
                    },
                ],
                metadata: {
                    service_id: service.id,
                },
                proration_behavior: 'none',
            });

            const subscription = await this.request('post', '/subscription_schedules', {
                customer: customer.id,
                start_date: Carbon.now().startOfDay().timestamp,
                phases,
                metadata: { service_id: service.id },
            });

            // Update service with subscription id
            await service.update({ subscription_id: subscription.subscription });
            await service.relation('properties').updateOrCreate({ key: 'has_stripe_subscription' }, { value: '1' });
        }
    }

    async updateSubscription(service: Service) {
        // Grab the schedule from Stripe
        const scheduleId = await this.request('get', '/subscriptions/' + service.subscription_id);
        const plan = (await service.rel('plan'))!;
        const currency = (await service.rel('currency'))!;

        if (service.isDirty('price')) {
            if (scheduleId.schedule) {
                const oldPhases = (await this.request('get', '/subscription_schedules/' + scheduleId.schedule)).phases;
                // Overwrite phase 2 item 0 with the new price
                const phases: any[] = [];
                // Only keep items and end, start date
                for (const phase of oldPhases) {
                    phases.push({
                        items: phase.items,
                        end_date: phase.end_date,
                        start_date: phase.start_date,
                    });
                }
                // Check if the service->product already exists in Stripe
                const product = (await service.rel('product'))!;
                let stripeProduct = await this.request('get', '/products/search', { query: `metadata['product_id']:'${product.id}'` });

                if (!stripeProduct.data?.length) {
                    // Create product
                    stripeProduct = await this.request('post', '/products', {
                        name: product.name,
                        metadata: { product_id: product.id },
                    });
                } else {
                    stripeProduct = stripeProduct.data[0];
                }
                // Latest phase is the current one
                const key = phases.length - 1;
                phases[key].items[0].price_data = {
                    currency: currency.code,
                    unit_amount: Number(service.price) * 100,
                    product: stripeProduct.id,
                    recurring: {
                        interval: plan.billing_unit,
                        interval_count: plan.billing_period,
                    },
                };
                phases[key].items[0].price = null;
                phases[key].items[0].plan = null;

                // Update the schedule
                await this.request('post', '/subscription_schedules/' + scheduleId.schedule, {
                    phases,
                    proration_behavior: 'none',
                });
            } else {
                // Get subscription
                const subscription = await this.request('get', '/subscriptions/' + service.subscription_id);
                // Get first item
                const item = subscription.items.data[0];
                // Update price
                await this.request('post', '/subscription_items/' + item.id, {
                    price_data: {
                        currency: currency.code,
                        unit_amount: Number(service.price) * 100,
                        product: item.price.product,
                        recurring: {
                            interval: plan.billing_unit,
                            interval_count: plan.billing_period,
                        },
                    },
                    proration_behavior: 'none',
                });
            }
        }

        if (service.isDirty('expires_at')) {
            // (reading a missing property raised an error in the PHP release; the caller swallows it)
            if (scheduleId.current_period_end === undefined) throw new Error('Undefined property: current_period_end');
            const subDate = Carbon.createFromTimestamp(scheduleId.current_period_end).startOfDay();
            const expiresAt = service.expires_at as unknown as Carbon;
            // Check if current date is before the end date of the subscription
            if (subDate.timestamp === expiresAt.timestamp || expiresAt.timestamp <= subDate.timestamp) {
                return;
            }

            if (scheduleId.schedule) {
                // As phases are only used for the setup fee, we can remove the phases
                await this.request('post', '/subscription_schedules/' + scheduleId.schedule + '/release', {});

                // Get subscription
                const subscription = await this.request('get', '/subscriptions/' + service.subscription_id);
                // Get first item
                const item = subscription.items.data[0];
                // Update price
                await this.request('post', '/subscription_items/' + item.id, {
                    price_data: {
                        currency: currency.code,
                        unit_amount: Number(service.price) * 100,
                        product: item.price.product,
                        recurring: {
                            interval: plan.billing_unit,
                            interval_count: plan.billing_period,
                        },
                    },
                    proration_behavior: 'none',
                });
            }
            // Update the subscription
            await this.request('post', '/subscriptions/' + service.subscription_id, {
                trial_end: expiresAt.timestamp,
                proration_behavior: 'none',
            });
        }
    }

    async cancelSubscription(service: Service) {
        if (!service.subscription_id && !(await hasStripeSubscription(service))) {
            return;
        }
        await this.request('delete', '/subscriptions/' + service.subscription_id);

        // Remove subscription id from service
        await service.update({ subscription_id: null });
        // Remove has_stripe_subscription property
        await service.relation('properties').where('key', 'has_stripe_subscription').delete();

        return true;
    }

    supportsBillingAgreements(): boolean {
        return true;
    }

    /**
     * Ensure a Stripe Customer exists for the given user. If a customer already
     * exists it will be returned; otherwise a new customer will be created.
     *
     * @param includeDetails Whether to include address, phone, and company details
     * @return Stripe customer object
     */
    private async createOrGetStripeCustomer(user: User, includeDetails = true): Promise<any> {
        const stripeCustomerId = await user.relation('properties').where('key', 'stripe_id').first();

        if (stripeCustomerId) {
            try {
                const customer = await this.request('get', '/customers/' + stripeCustomerId.value);
                if (customer.deleted === undefined) {
                    return customer;
                }
            } catch {
                // continue and create a new customer
            }
        }

        // Build basic payload
        const payload: Record<string, any> = {
            email: user.email,
            name: await user.name(),
            metadata: { user_id: user.id },
        };

        // Add detailed information if requested
        if (includeDetails) {
            const props: Record<string, any> = {};
            for (const p of await user.relation('properties').get()) props[p.key as string] = p.value;

            if (props.company_name) {
                payload.description = props.company_name;
            }

            // array_filter(): drop empty values
            const address = Object.fromEntries(
                Object.entries({
                    line1: props.address ?? null,
                    line2: props.address2 ?? null,
                    city: props.city ?? null,
                    state: props.state ?? null,
                    postal_code: props.zip ?? null,
                    country: props.country ?? null,
                }).filter(([, v]) => v !== null && v !== '' && v !== '0' && v !== 0 && v !== false),
            );

            if (Object.keys(address).length) {
                payload.address = address;
            }

            if (props.phone) {
                payload.phone = props.phone;
            }
        }

        const customer = await this.request('post', '/customers', payload);

        await user.relation('properties').updateOrCreate({ key: 'stripe_id' }, { value: customer.id });

        return customer;
    }

    async createBillingAgreement(user: User) {
        // Create or fetch a Stripe customer for this user, use detailed info based on setting
        const includeDetails = Boolean(this.config('stripe_create_customers'));
        const customer = await this.createOrGetStripeCustomer(user, includeDetails);

        const setupIntent = await this.request('post', '/setup_intents', {
            metadata: {
                user_id: user.id,
                is_billing_agreement: '1',
            },
            usage: 'off_session',
            customer: customer.id,
        });

        // Return the client secret to the frontend to complete the setup
        return (
            <StripeElements
                mode="setup"
                publishableKey={this.config<string>('stripe_publishable_key') as string}
                clientSecret={setupIntent.client_secret}
                name={await user.name()}
                email={user.email as string}
                returnUrl={route('extensions.gateways.stripe.setup-agreement')}
            />
        );
    }

    async cancelBillingAgreement(billingAgreement: BillingAgreement): Promise<boolean> {
        try {
            await this.request('post', '/payment_methods/' + billingAgreement.external_reference + '/detach');
        } catch {
            // If the payment method is already removed, we still delete the billing agreement
        }

        return true;
    }

    async setupAgreement(user: User, input: Record<string, any>, referer: string | null) {
        const id = input.setup_intent;
        if (typeof id !== 'string' || id === '' || id.length > 255 || !/^seti_[a-zA-Z0-9]{24,}$/.test(id)) {
            // failed validation: back to where the visitor came from
            return redirectWithNotification(referer ?? '/');
        }

        const setupIntent = await this.request('get', '/setup_intents/' + id);

        if (setupIntent.status !== 'succeeded') {
            return redirectWithNotification(route('account.payment-methods'), {
                type: 'danger',
                message: 'Could not add payment method, setup not completed successfully.',
            });
        }
        // Validate if user id matches
        if (user.id != setupIntent.metadata.user_id) {
            return abort(403, 'Unauthorized');
        }

        await this.setupBillingAgreement(setupIntent);

        return redirectWithNotification(route('account.payment-methods'), {
            type: 'success',
            message: 'Payment method added successfully.',
        });
    }

    private async setupBillingAgreement(setupIntent: any) {
        const user = await User.findOrFail<User>(setupIntent.metadata.user_id);

        // Get setup intent with expanded data
        setupIntent = await this.request('get', '/setup_intents/' + setupIntent.id, {
            expand: ['latest_attempt'],
        });

        // Get the actual payment method that will be used for future charges
        const actualPaymentMethod = await this.getActualPaymentMethod(setupIntent);

        const data = this.getPaymentDetails(actualPaymentMethod);

        // Save billing agreement
        await ExtensionHelper.makeBillingAgreement(user, 'Stripe', data.name, actualPaymentMethod.id, data.type, data.expiry);
    }

    private async getActualPaymentMethod(setupIntent: any) {
        const latestAttempt = setupIntent.latest_attempt;

        // Check if the payment method was converted to another type
        if (latestAttempt && latestAttempt.payment_method_details !== undefined) {
            const details = latestAttempt.payment_method_details;

            if (['ideal', 'bancontact', 'sofort'].includes(details.type)) {
                // These payment methods can be converted to SEPA Direct Debit
                return this.request('get', '/payment_methods/' + details[details.type].generated_sepa_debit);
            }
        }

        // If no conversion, use the original payment method
        return this.request('get', '/payment_methods/' + setupIntent.payment_method);
    }

    private getPaymentDetails(paymentMethod: any): { name: string; type: string; expiry: string | null } {
        let name: string;
        switch (paymentMethod.type) {
            case 'card': {
                const brand = (
                    {
                        amex: 'American Express',
                        diners: 'Diners Club',
                        discover: 'Discover',
                        jcb: 'JCB',
                        mastercard: 'Mastercard',
                        unionpay: 'UnionPay',
                        visa: 'Visa',
                    } as Record<string, string>
                )[paymentMethod.card.brand] ?? ucfirst(paymentMethod.card.brand);
                name = brand + ' **** ' + paymentMethod.card.last4;
                break;
            }
            case 'sepa_debit':
                name = 'SEPA Direct Debit **** ' + paymentMethod.sepa_debit.last4;
                break;
            case 'ideal':
                name = 'iDEAL **** ' + paymentMethod.ideal.bank_code;
                break;
            case 'bancontact':
                name = 'Bancontact **** ' + paymentMethod.bancontact.bank_code;
                break;
            case 'sofort':
                name = 'SOFORT **** ' + String(paymentMethod.sofort.country).toUpperCase();
                break;
            case 'us_bank_account':
                name = 'US Bank Account **** ' + paymentMethod.us_bank_account.last4;
                break;
            case 'bacs_debit':
                name = 'Bacs Direct Debit **** ' + paymentMethod.bacs_debit.last4;
                break;
            case 'au_becs_debit':
                name = 'BECS Direct Debit **** ' + paymentMethod.au_becs_debit.last4;
                break;
            default:
                name = ucfirst(String(paymentMethod.type).replaceAll('_', ' '));
        }
        // For the others, just return the type as is
        const type = paymentMethod.type === 'card' ? paymentMethod.card.brand : paymentMethod.type;
        let expiry: string | null = null;
        if (paymentMethod.type === 'card') {
            expiry = Carbon.createFromDate(paymentMethod.card.exp_year, paymentMethod.card.exp_month, 1).endOfMonth().format('Y-m-d');
        }

        return { name, type, expiry };
    }

    async charge(invoice: Invoice, amount: number, billingAgreement: BillingAgreement): Promise<boolean> {
        const user = (await invoice.rel('user'))!;
        const stripeCustomerId = (await user.rel('properties')).find((p) => p.key === 'stripe_id');
        // Create customer if not exists
        if (!stripeCustomerId) {
            throw new DisplayException('Stripe customer not found');
        }
        const customer = await this.request('get', '/customers/' + stripeCustomerId.value);

        // Create payment intent
        try {
            await this.request('post', '/payment_intents', {
                amount: amount * 100,
                currency: invoice.currency_code,
                customer: customer.id,
                payment_method: billingAgreement.external_reference,
                off_session: 'true',
                confirm: 'true',
                metadata: { invoice_id: invoice.id, billing_agreement_id: billingAgreement.id },
            });
        } catch (e: any) {
            if (e instanceof RequestException && e.response.status() === 400) {
                const error = e.response.object().error;
                // If error is invalid_request_error and message contains "The provided currency" we can show the message
                if (error.type === 'invalid_request_error' && String(error.message).includes('The currency provided')) {
                    throw new DisplayException('Cannot charge the billing agreement because the card does not support the invoice currency (' + invoice.currency_code + '). Please use another payment method.');
                }
            }
            throw new DisplayException('Could not process payment');
        }

        return true;
    }

    // Function to split and decode the Stripe-Signature header
    private getHeaderValues(sigHeader: string | null): [string | null, string | null] {
        const parts = (sigHeader ?? '').split(',');
        let timestamp: string | null = null;
        let signature: string | null = null;

        for (const part of parts) {
            if (part.startsWith('t=')) {
                timestamp = part.slice(2);
            } else if (part.startsWith('v1=')) {
                signature = part.slice(3);
            }
        }

        return [timestamp, signature];
    }

    // Validate the signature
    private isValidSignature(payload: string, sigHeader: string | null, secret: string | null): boolean {
        const [timestamp, signature] = this.getHeaderValues(sigHeader);

        if (!timestamp || !signature || !secret) {
            return false;
        }

        // Create the signed payload string
        const signedPayload = timestamp + '.' + payload;

        // Compute the expected signature
        const expectedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');

        // Compare the expected signature to the actual signature
        const a = Buffer.from(expectedSignature);
        const b = Buffer.from(signature);
        return a.length === b.length && timingSafeEqual(a, b);
    }


    supportsRefunds(): boolean {
        return true;
    }

    async refund(transaction: InvoiceTransaction, amount: number): Promise<boolean> {
        const paymentIntentId = transaction.transaction_id;
        if (!paymentIntentId) throw new Error('Transaction has no Stripe payment intent ID.');
        await this.request('post', '/refunds', { payment_intent: paymentIntentId, amount: Math.round(amount * 100) });
        return true;
    }
}
