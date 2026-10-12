import { Gateway } from '@/server/extensions/Gateway';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Http } from '@/server/http';
import { route } from '@/server/routes';
import { numberFormat } from '@/server/lib/php';
import { Invoice } from '@/server/models/Invoice';

export default class PayPal_IPN extends Gateway {
    static meta = {
        name: 'PayPal IPN',
        description: 'Accept payments via PayPal. With only your email',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://paymenter.org/docs/extensions/paypal',
        icon: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICAgIDxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiBmaWxsPSIjRjVGNkY4IiAvPgogICAgPHBhdGggZD0iTTMzNi4zOTcgMTgxLjQ4QzMzNi4zOTcgMjE1LjY2NyAzMDQuODQ3IDI1NiAyNTcuMTExIDI1NkgyMTEuMTI5TDIwOC44NzIgMjcwLjI0MkwxOTguMTQ1IDMzOC44SDE0MUwxNzUuMzc4IDExOEgyNjcuOTYxQzI5OS4xMzcgMTE4IDMyMy42NjQgMTM1LjM3NiAzMzIuNjk4IDE1OS41MjNDMzM1LjMwNCAxNjYuNTQzIDMzNi41NTkgMTczLjk5MyAzMzYuMzk3IDE4MS40OFoiIGZpbGw9IiMwMDI5OTEiIC8+CiAgICA8cGF0aCBkPSJNMzY5LjMzMSAyNDQuOTZDMzYzLjAzMSAyODMuMjM3IDMyOS44OTggMzExLjI5MyAyOTEuMTA2IDMxMS4ySDI1OS4xNzZMMjQ1Ljg4NSAzOTRIMTg5LjA0N0wxOTguMTQzIDMzOC44TDIwOC44NzYgMjcwLjI0MUwyMTEuMTI3IDI1NkgyNTcuMTA5QzMwNC43ODMgMjU2IDMzNi4zOTUgMjE1LjY2NyAzMzYuMzk1IDE4MS40NzlDMzU5Ljg1NSAxOTMuNTg3IDM3My41MzIgMjE4LjA1MyAzNjkuMzMxIDI0NC45NloiIGZpbGw9IiM2MENERkYiIC8+CiAgICA8cGF0aCBkPSJNMzM2LjM5NyAxODEuNDhDMzI2LjU1OSAxNzYuMzM0IDMxNC42MjkgMTczLjIgMzAxLjY0NSAxNzMuMkgyMjQuMTE5TDIxMS4xMjkgMjU2SDI1Ny4xMTFDMzA0Ljc4NSAyNTYgMzM2LjM5NyAyMTUuNjY3IDMzNi4zOTcgMTgxLjQ4WiIgZmlsbD0iIzAwOENGRiIgLz4KPC9zdmc+Cg==',
    };

    routes(): ExtensionRoute[] {
        return [
            {
                name: 'extensions.gateways.paypal_ipn.notify',
                method: 'POST',
                path: '/extensions/paypal_ipn/notify',
                async handler(ctx) {
                    const gateway = await ctx.instance<PayPal_IPN>();
                    await gateway.notify(await ctx.all());
                    return new Response(null, { status: 200 });
                },
            },
        ];
    }

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'email',
                label: 'PayPal Email',
                type: 'text',
                required: true,
            },
            {
                name: 'test_mode',
                label: 'Test Mode',
                type: 'checkbox',
                required: false,
            },
        ];
    }

    /**
     * Return a view or a url to redirect to
     */
    pay(invoice: Invoice, total: number) {
        const paypalUrl = this.config('test_mode') ? 'https://www.sandbox.paypal.com/cgi-bin/webscr' : 'https://www.paypal.com/cgi-bin/webscr';
        const paypalEmail = this.config('email');
        const returnUrl = route('invoices.show', invoice);
        const cancelUrl = route('invoices.show', invoice);

        const notifyUrl = route('extensions.gateways.paypal_ipn.notify');

        // PHP urlencode(): spaces become "+"
        let query = '?cmd=_xclick';
        query += '&item_name=' + encodeURIComponent('Invoice #' + invoice.id).replace(/%20/g, '+');
        query += '&item_number=' + invoice.id;
        query += '&amount=' + numberFormat(total, 2, '.', '');
        query += '&currency_code=' + invoice.currency_code;
        query += '&business=' + paypalEmail;
        query += '&notify_url=' + notifyUrl;
        query += '&return=' + returnUrl;
        query += '&cancel_return=' + cancelUrl;

        return paypalUrl + query;
    }

    /**
     * Handle the IPN request
     */
    async notify(input: Record<string, any>) {
        // Send the request to PayPal
        const response = await Http.asForm().post(this.config('test_mode') ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr' : 'https://ipnpb.paypal.com/cgi-bin/webscr', {
            cmd: '_notify-validate',
            ...input,
        });

        // Check if the response is verified
        if (response.body() == 'VERIFIED') {
            // Validate owner and amount
            if (String(input.receiver_email ?? '').toLowerCase() !== String(this.config('email') ?? '').toLowerCase()) {
                return;
            }
            if (input.payment_status !== 'Completed') {
                return;
            }
            // Validate currency and amount
            const invoice = await Invoice.find<Invoice>(input.item_number);
            if (!invoice || input.mc_currency !== invoice.currency_code) {
                return;
            }
            await ExtensionHelper.addPayment(input.item_number, 'PayPal', Number(input.mc_gross), input.mc_fee === undefined ? null : Number(input.mc_fee), input.txn_id);
        }
    }
}
