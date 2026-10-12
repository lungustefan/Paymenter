import { Gateway } from '@/server/extensions/Gateway';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Http } from '@/server/http';
import { route } from '@/server/routes';
import { numberFormat } from '@/server/lib/php';
import type { Invoice } from '@/server/models/Invoice';

export default class Mollie extends Gateway {
    static meta = {
        name: 'Mollie Gateway',
        description: 'Accept payments via Mollie.',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/mollie',
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODciIGhlaWdodD0iNTgiIHZpZXdib3g9IjAgMCA4NyA1OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBjbGFzcz0iZ3JvdXAtaG92ZXIvYXBwOnNjYWxlLTEyMCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBzaXplLTE4IHJvdW5kZWQteGwgcC00IGJnLWJsYWNrIHJpbmctNiByaW5nLXdoaXRlLzEwIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTYzLjkyMiAwLjg1MjA5NkM2My4xOTkgMC43NjE3MTkgNjIuNDc2IDAuNzYxNzE5IDYxLjc1MjkgMC43NjE3MTlDNTQuNzkzOSAwLjc2MTcxOSA0OC4xOTY1IDMuNTYzMzkgNDMuNDk2OSA4LjYyNDQ4QzM4Ljc5NzMgMy42NTM3NyAzMi4xOTk4IDAuNzYxNzE5IDI1LjMzMTIgMC43NjE3MTlDMTEuNTAzNiAwLjc2MTcxOSAwLjI5Njg3NSAxMS45Njg0IDAuMjk2ODc1IDI1LjYxNTNWNTYuOTc1OUgxMy43NjNWMjYuMDY3MkMxMy43NjMgMjAuMzczNCAxOC40NjI2IDE1LjEzMTYgMjMuOTc1NSAxNC41ODkzQzI0LjMzNyAxNC41ODkzIDI0Ljc4ODkgMTQuNDk5IDI1LjE1MDQgMTQuNDk5QzMxLjM4NjQgMTQuNDk5IDM2LjQ0NzUgMTkuNTYgMzYuNDQ3NSAyNS43OTZWNTcuMDY2M0g1MC4xODQ3VjI1Ljk3NjhDNTAuMTg0NyAyMC4yODMxIDU0Ljg4NDMgMTUuMDQxMiA2MC4zOTczIDE0LjQ5OUM2MC43NTg4IDE0LjQ5OSA2MS4yMTA3IDE0LjQwODYgNjEuNTcyMiAxNC40MDg2QzY3LjgwODIgMTQuNDA4NiA3Mi44NjkzIDE5LjQ2OTcgNzIuOTU5NiAyNS42MTUzVjU2Ljk3NTlIODYuNjk2OVYyNi4wNjcyQzg2LjY5NjkgMTkuNzQwOCA4NC4zNDcxIDEzLjc3NTkgODAuMTg5OCA5LjA3NjM2Qzc1Ljk0MjEgNC4yODY0MSA3MC4xNTggMS4zOTQzNiA2My45MjIgMC44NTIwOTZaIiBmaWxsPSJ3aGl0ZSI+PC9wYXRoPjwvc3ZnPg==',
        extensionId: 'unknown',
    };

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
