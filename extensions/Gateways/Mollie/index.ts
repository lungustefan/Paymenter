import { Gateway } from '@/server/extensions/Gateway';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Http } from '@/server/http';
import { route } from '@/server/routes';
import { numberFormat } from '@/server/lib/php';
import type { Invoice } from '@/server/models/Invoice';

export default class Mollie extends Gateway {
    routes(): ExtensionRoute[] {
        // Register webhook route
        return [
            {
                name: 'extensions.gateways.mollie.webhook',
                method: 'POST',
                path: '/extensions/gateways/mollie/webhook',
                async handler(ctx) {
                    const mollie = await ctx.instance<Mollie>();
                    await mollie.webhook(await ctx.all());
                    return new Response(null, { status: 200 });
                },
            },
        ];
    }

    private async request(url: string, method: 'get' | 'post' = 'get', data: Record<string, any> = {}) {
        const response = await Http.withHeaders({
            Authorization: 'Bearer ' + this.config('api_key'),
            'Content-Type': 'application/json',
        })[method](`https://api.mollie.com${url}`, data);

        if (!response.successful()) {
            throw new Error('Mollie API error: ' + response.json()['detail']);
        }

        return response.json();
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'api_key',
                label: 'API Key',
                type: 'text',
                encrypted: true,
                required: true,
            },
        ];
    }

    /**
     * Return a view or a url to redirect to
     */
    async pay(invoice: Invoice, total: number) {
        const response = await this.request('/v2/payments', 'post', {
            amount: {
                currency: invoice.currency_code,
                value: numberFormat(total, 2, '.', ''),
            },
            description: 'Invoice #' + invoice.id,
            redirectUrl: route('invoices.show', invoice) + '?checkPayment=true',
            cancelUrl: route('invoices.show', invoice),
            webhookUrl: route('extensions.gateways.mollie.webhook', invoice),
            metadata: {
                invoice_id: invoice.id,
            },
        });

        return response['_links']['checkout']['href'] as string;
    }

    async webhook(input: Record<string, any>) {
        const payment = await this.request('/v2/payments/' + input.id);

        if (payment['status'] == 'paid') {
            await ExtensionHelper.addPayment(payment['metadata']['invoice_id'], 'Mollie', Number(payment['amount']['value']), null, payment['id']);
        }
    }
}
