import { Gateway } from '@/server/extensions/Gateway';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { redirectWithNotification } from '@/server/extensions/response';
import { Events } from '@/server/event-defs';
import { listen } from '@/server/events';
import { Http } from '@/server/http';
import { route } from '@/server/routes';
import { setting } from '@/server/config';
import { randomString } from '@/server/lib/ids';
import { BillingAgreement } from '@/server/models/BillingAgreement';
import { Invoice } from '@/server/models/Invoice';
import type { InvoiceItem } from '@/server/models/InvoiceItem';
import { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';
import PayPalButtons from './PayPalButtons';

/** PHP `uniqid()`: 13 hex characters (time based) */
const uniqid = () => {
    const now = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    return Math.floor(now / 1_000_000).toString(16).padStart(8, '0') + (now % 1_000_000).toString(16).padStart(5, '0');
};

const abort = (status: number, message = '') => new Response(message, { status });

export default class PayPal extends Gateway {
    static meta = {
        name: 'PayPal Gateway',
        description: 'Accept payments via PayPal.',
        version: '1.0.0',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/paypal',
        icon: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICAgIDxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiBmaWxsPSIjRjVGNkY4IiAvPgogICAgPHBhdGggZD0iTTMzNi4zOTcgMTgxLjQ4QzMzNi4zOTcgMjE1LjY2NyAzMDQuODQ3IDI1NiAyNTcuMTExIDI1NkgyMTEuMTI5TDIwOC44NzIgMjcwLjI0MkwxOTguMTQ1IDMzOC44SDE0MUwxNzUuMzc4IDExOEgyNjcuOTYxQzI5OS4xMzcgMTE4IDMyMy42NjQgMTM1LjM3NiAzMzIuNjk4IDE1OS41MjNDMzM1LjMwNCAxNjYuNTQzIDMzNi41NTkgMTczLjk5MyAzMzYuMzk3IDE4MS40OFoiIGZpbGw9IiMwMDI5OTEiIC8+CiAgICA8cGF0aCBkPSJNMzY5LjMzMSAyNDQuOTZDMzYzLjAzMSAyODMuMjM3IDMyOS44OTggMzExLjI5MyAyOTEuMTA2IDMxMS4ySDI1OS4xNzZMMjQ1Ljg4NSAzOTRIMTg5LjA0N0wxOTguMTQzIDMzOC44TDIwOC44NzYgMjcwLjI0MUwyMTEuMTI3IDI1NkgyNTcuMTA5QzMwNC43ODMgMjU2IDMzNi4zOTUgMjE1LjY2NyAzMzYuMzk1IDE4MS40NzlDMzU5Ljg1NSAxOTMuNTg3IDM3My41MzIgMjE4LjA1MyAzNjkuMzMxIDI0NC45NloiIGZpbGw9IiM2MENERkYiIC8+CiAgICA8cGF0aCBkPSJNMzM2LjM5NyAxODEuNDhDMzI2LjU1OSAxNzYuMzM0IDMxNC42MjkgMTczLjIgMzAxLjY0NSAxNzMuMkgyMjQuMTE5TDIxMS4xMjkgMjU2SDI1Ny4xMTFDMzA0Ljc4NSAyNTYgMzM2LjM5NyAyMTUuNjY3IDMzNi4zOTcgMTgxLjQ4WiIgZmlsbD0iIzAwOENGRiIgLz4KPC9zdmc+Cg==',
    };

    private accessToken: Promise<string> | null = null;

    private get baseUrl() {
        return this.config('test_mode') ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    }

    supportsBillingAgreements(): boolean {
        return this.config('paypal_support_billing_agreements') ?? false;
    }

    async createBillingAgreement(_user: User) {
        // Using PayPal Vaulting
        const result = await this.request('post', this.baseUrl + '/v3/vault/setup-tokens', {
            payment_source: {
                paypal: {
                    description: 'Billing Agreement for ' + setting('company_name'),
                    usage_type: 'MERCHANT',
                    experience_context: {
                        payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
                        return_url: route('extensions.gateways.paypal.setup-agreement'),
                        cancel_url: route('account.payment-methods'),
                        brand_name: setting('company_name'),
                        shipping_preference: 'NO_SHIPPING',
                        vault_instruction: 'ON_PAYER_APPROVAL',
                    },
                },
            },
        });

        if (!result?.links?.[1]?.href) {
            throw new Error('Failed to create billing agreement.');
        }

        return result.links[1].href as string;
    }

    async cancelBillingAgreement(billingAgreement: BillingAgreement): Promise<boolean> {
        await this.request('delete', this.baseUrl + '/v3/vault/payment-tokens/' + billingAgreement.external_reference);

        return true;
    }

    async setupAgreement(user: User, input: Record<string, any>) {
        const tokenId = input.approval_token_id;
        if (typeof tokenId !== 'string' || tokenId === '' || tokenId.length > 255) return null;

        const result = await this.request('post', this.baseUrl + '/v3/vault/payment-tokens', {
            payment_source: {
                token: {
                    id: tokenId,
                    type: 'SETUP_TOKEN',
                },
            },
        });

        await ExtensionHelper.makeBillingAgreement(user, 'PayPal', 'PayPal ' + result.payment_source.paypal.email_address, result.id, 'paypal');

        return redirectWithNotification(route('account.payment-methods'), {
            type: 'success',
            message: 'Payment method added successfully.',
        });
    }

    async charge(invoice: Invoice, total: number, billingAgreement: BillingAgreement): Promise<boolean> {
        await this.request('post', this.baseUrl + '/v2/checkout/orders', {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    invoice_id: invoice.id,
                    amount: {
                        currency_code: invoice.currency_code,
                        value: total,
                    },
                },
            ],
            payment_source: {
                paypal: {
                    vault_id: billingAgreement.external_reference,
                },
            },
        });

        return true;
    }

    boot() {
        // Register the listeners once per process (the extension is re-booted when its settings change)
        if ((PayPal as any).listening) return;
        (PayPal as any).listening = true;

        listen(Events.Service.Updated, async ({ service }) => {
            if ((await service.rel('properties')).find((p) => p.key === 'has_paypal_subscription')?.value !== '1') {
                return;
            }
            const paypal = await ExtensionHelper.freshInstance<PayPal>('gateway', 'PayPal');
            if (service.isDirty('price')) {
                try {
                    await paypal.updateSubscription(service);
                } catch {
                    /* ignored */
                }
            }
            if (service.isDirty('status') && service.status === Service.STATUS_CANCELLED) {
                try {
                    await paypal.cancelSubscription(service);
                } catch {
                    /* ignored */
                }
            }
        });

        listen(Events.ServiceCancellation.Created, async ({ cancellation }) => {
            const service = (await cancellation.rel('service'))!;
            if ((await service.rel('properties')).find((p) => p.key === 'has_paypal_subscription')?.value !== '1') {
                return;
            }
            try {
                await (await ExtensionHelper.freshInstance<PayPal>('gateway', 'PayPal')).cancelSubscription(service);
            } catch {
                // Log the error or handle it as needed
            }
        });
    }

    routes(): ExtensionRoute[] {
        return [
            {
                name: 'extensions.gateways.paypal.webhook',
                method: 'POST',
                path: '/extensions/paypal/webhook',
                async handler(ctx) {
                    return (await ctx.instance<PayPal>()).webhook(ctx.request.headers, await ctx.text());
                },
            },
            {
                name: 'extensions.gateways.paypal.capture',
                method: 'POST',
                path: '/extensions/paypal/capture/{invoice}/{orderID}',
                where: { orderID: '[0-9A-Za-z\\-]+' },
                auth: true,
                async handler(ctx) {
                    const invoice = await Invoice.resolveRouteBinding(ctx.params.invoice);
                    if (!invoice) return abort(404);
                    // can:view,invoice
                    if (invoice.user_id !== ctx.user!.id) return abort(403);
                    return (await ctx.instance<PayPal>()).capture(invoice, ctx.params.orderID);
                },
            },
            {
                name: 'extensions.gateways.paypal.setup-agreement',
                method: 'GET',
                path: '/extensions/paypal/setup-agreement',
                auth: true,
                async handler(ctx) {
                    const res = await (await ctx.instance<PayPal>()).setupAgreement(ctx.user!, await ctx.all());
                    // failed validation: back to where the visitor came from
                    return res ?? redirectWithNotification(ctx.request.headers.get('referer') ?? '/');
                },
            },
        ];
    }

    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'client_id',
                label: 'Client ID',
                type: 'text',
                description: 'Find your API keys at https://developer.paypal.com/developer/applications',
                required: true,
            },
            {
                name: 'client_secret',
                label: 'Client Secret',
                type: 'text',
                encrypted: true,
                description: 'Find your API keys at https://developer.paypal.com/developer/applications',
                required: true,
            },
            {
                name: 'webhook_id',
                label: 'Webhook ID',
                type: 'text',
                description: 'Find your webhook ID at https://developer.paypal.com/developer/webhooks',
                required: true,
            },
            {
                name: 'test_mode',
                label: 'Test Mode',
                type: 'checkbox',
                description: 'Enable test mode',
                required: false,
            },
            {
                name: 'paypal_support_billing_agreements',
                label: 'Supports Billing Agreements',
                type: 'checkbox',
                description: 'Enable this option if your PayPal account supports billing agreements. <a href="https://paymenter.org/docs/extensions/paypal#billing-agreements" target="_blank" rel="noopener">Learn more</a>',
                descriptionHtml: true,
                required: false,
            },
        ];
    }

    private generateAccessToken(): Promise<string> {
        // once()
        this.accessToken ??= (async () => {
            const result = await Http.withHeaders({
                Accept: 'application/json',
                Authorization: 'Basic ' + Buffer.from(this.config('client_id') + ':' + this.config('client_secret')).toString('base64'),
            })
                .asForm()
                .post(this.baseUrl + '/v1/oauth2/token', {
                    grant_type: 'client_credentials',
                });

            if (result.failed()) {
                throw new Error('Failed to generate access token: ' + result.body());
            }

            return result.json()['access_token'] as string;
        })();
        return this.accessToken;
    }

    async request(method: string, url: string, data: Record<string, any> | any[] = {}): Promise<any> {
        const pending = Http.withHeaders({
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + (await this.generateAccessToken()),
            'PayPal-Request-Id': uniqid(),
        });
        const response = await (pending as any)[method.toLowerCase()](url, data);
        return response.object();
    }

    async pay(invoice: Invoice, total: number) {
        const order = await this.request('post', this.baseUrl + '/v2/checkout/orders', {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    invoice_id: invoice.id,
                    amount: {
                        currency_code: invoice.currency_code,
                        value: total,
                    },
                },
            ],
            application_context: {
                return_url: route('invoices.show', invoice),
                cancel_url: route('invoices.show', invoice),
                // Disable shipping information
                shipping_preference: 'NO_SHIPPING',
            },
        });

        return (
            <PayPalButtons
                clientId={this.config<string>('client_id') as string}
                currency={invoice.currency_code as string}
                total={total}
                orderId={order.id}
                captureUrl={route('extensions.gateways.paypal.capture', { invoice, orderID: order.id })}
                invoiceUrl={route('invoices.show', invoice)}
            />
        );
    }

    async capture(invoice: Invoice, orderID: string) {
        // Validate the order ID format
        if (!/^[A-Z0-9-]+$/.test(orderID)) {
            return abort(400);
        }

        // First check if the order is already captured
        const order = await this.request('get', this.baseUrl + '/v2/checkout/orders/' + orderID);

        // Verify if the invoice id matches the one from the order
        if (order?.purchase_units?.[0]?.invoice_id === undefined || order.purchase_units[0].invoice_id != invoice.id) {
            return abort(400, 'PayPal order is not associated with an invoice');
        }

        if (order.status === 'COMPLETED') {
            return Response.json(order);
        }

        if (order.status !== 'APPROVED') {
            return abort(400, 'PayPal order is not approved for capture');
        }

        // Verify currency matches the invoice
        if (order.purchase_units[0].amount.currency_code !== invoice.currency_code) {
            return abort(400, 'PayPal order currency does not match invoice currency');
        }

        const response = await this.request('post', this.baseUrl + '/v2/checkout/orders/' + orderID + '/capture', {
            intent: 'CAPTURE',
        });

        const capture = response?.purchase_units?.[0]?.payments?.captures?.[0];
        if ((response?.status ?? null) !== 'COMPLETED' || !capture) {
            return abort(400, 'Failed to capture PayPal order');
        }

        await ExtensionHelper.addPayment(order.purchase_units[0].invoice_id, 'PayPal', Number(capture.amount.value), Number(capture.seller_receivable_breakdown.paypal_fee.value), capture.id);

        return Response.json(response);
    }

    async webhook(headers: Headers, rawBody: string) {
        const verification = await this.request('post', this.baseUrl + '/v1/notifications/verify-webhook-signature', {
            auth_algo: headers.get('PAYPAL-AUTH-ALGO'),
            cert_url: headers.get('PAYPAL-CERT-URL'),
            transmission_id: headers.get('PAYPAL-TRANSMISSION-ID'),
            transmission_sig: headers.get('PAYPAL-TRANSMISSION-SIG'),
            transmission_time: headers.get('PAYPAL-TRANSMISSION-TIME'),
            webhook_id: this.config('webhook_id'),
            webhook_event: JSON.parse(rawBody),
        });

        if ((verification?.verification_status ?? null) !== 'SUCCESS') {
            return Response.json({ status: 'error' }, { status: 400 });
        }

        const body = JSON.parse(rawBody);

        // Handle the subscription event
        if (body.event_type === 'BILLING.SUBSCRIPTION.CREATED' && body.resource?.custom_id !== undefined) {
            // Its activated so we can now add the subscription to the user (custom is the order id)
            const invoice = await Invoice.findOrFail<Invoice>(body.resource.custom_id);
            const items = await invoice.relation<InvoiceItem>('items').where('reference_type', 'App\\Models\\Service').get();
            for (const item of items) {
                const service = (await item.rel('reference')) as Service;
                service.subscription_id = body.resource.id;
                await service.save();
                await service.relation('properties').updateOrCreate(
                    {
                        key: 'has_paypal_subscription',
                        name: 'Has PayPal Subscription',
                    },
                    {
                        value: '1',
                    },
                );
            }
        } else if (body.event_type === 'PAYMENT.SALE.COMPLETED' && body.resource?.billing_agreement_id !== undefined) {
            for (const service of await Service.query().where('subscription_id', body.resource.billing_agreement_id).get()) {
                // Add payment to the latest invoice
                const latestInvoice = (await service.relation<Invoice>('invoices').latest().first())!;
                await ExtensionHelper.addPayment(latestInvoice.id as number, 'PayPal', Number(body.resource.amount.total), Number(body.resource.transaction_fee.value), body.resource.id);
            }
        } else if (body.event_type === 'VAULT.PAYMENT-TOKEN.DELETED') {
            // Find the billing agreement with this external reference
            const billingAgreement = await BillingAgreement.query().where('external_reference', body.resource.id).first();
            if (billingAgreement) {
                await billingAgreement.delete();
            }
        } else if (body.event_type === 'PAYMENT.CAPTURE.COMPLETED' && body.resource?.supplementary_data?.related_ids?.order_id !== undefined) {
            const orderID = body.resource.supplementary_data.related_ids.order_id;
            const order = await this.request('get', this.baseUrl + '/v2/checkout/orders/' + orderID);

            if (order?.purchase_units?.[0]?.invoice_id !== undefined) {
                // Verify that the currency is the same as the invoice
                const invoice = await Invoice.find<Invoice>(order.purchase_units[0].invoice_id);
                const capture = order.purchase_units[0].payments.captures[0];
                if (invoice && invoice.currency_code === capture.amount.currency_code) {
                    await ExtensionHelper.addPayment(order.purchase_units[0].invoice_id, 'PayPal', Number(capture.amount.value), Number(capture.seller_receivable_breakdown.paypal_fee.value), body.resource.id);
                }
            }
        }

        return Response.json({ status: 'success' });
    }

    async updateSubscription(service: Service) {
        if ((await service.rel('properties')).find((p) => p.key === 'has_paypal_subscription')?.value !== '1') {
            return false;
        }
        // Update subscription price
        const newPrice = await Service.query().where('subscription_id', service.subscription_id).sum('price');
        // Grab currenct subscription ID
        const subscriptionId = service.subscription_id;

        // Update subscription price
        await this.request('PATCH', this.baseUrl + '/v1/billing/subscriptions/' + subscriptionId, [
            {
                op: 'replace',
                path: '/plan/billing_cycles/@sequence==2/pricing_scheme/fixed_price',
                value: {
                    value: newPrice,
                    currency_code: service.currency_code,
                },
            },
        ]);

        return true;
    }

    async cancelSubscription(service: Service) {
        // Cancel subscription
        await this.request('post', this.baseUrl + '/v1/billing/subscriptions/' + service.subscription_id + '/cancel', {
            reason: 'User canceled',
        });

        await service.relation('properties').where('key', 'has_paypal_subscription').delete();

        return true;
    }
}
