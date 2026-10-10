'use client';

import { useEffect, useRef } from 'react';

/** resources/views/pay.blade.php of the PayPal gateway: the PayPal smart buttons inside the payment modal. */
export default function PayPalButtons({
    clientId,
    currency,
    total,
    orderId,
    captureUrl,
    invoiceUrl,
}: {
    clientId: string;
    currency: string;
    total: number;
    orderId: string;
    captureUrl: string;
    invoiceUrl: string;
}) {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=buttons`;
        let cancelled = false;

        const resultMessage = (message: string) => {
            if (container.current) container.current.innerHTML = message;
        };

        const render = () => {
            const paypal = (window as any).paypal;
            if (cancelled || !paypal || !container.current || container.current.childElementCount > 0) return;
            paypal
                .Buttons({
                    style: {
                        shape: 'rect',
                        layout: 'vertical',
                        color: 'gold',
                        label: 'paypal',
                    },
                    message: {
                        amount: total,
                    },
                    async createOrder() {
                        return orderId;
                    },

                    async onApprove(_data: unknown, actions: any) {
                        try {
                            const response = await fetch(captureUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                            });

                            const orderData = await response.json();

                            const errorDetail = orderData?.details?.[0];

                            if (errorDetail?.issue === 'INSTRUMENT_DECLINED') {
                                return actions.restart();
                            } else if (errorDetail) {
                                throw new Error(`${errorDetail.description} (${orderData.debug_id})`);
                            } else if (!orderData.purchase_units) {
                                throw new Error(JSON.stringify(orderData));
                            } else {
                                actions.redirect(`${invoiceUrl}?checkPayment=true`);
                            }
                        } catch (error) {
                            console.error(error);
                            resultMessage(`Sorry, your transaction could not be processed...<br><br>${error}`);
                        }
                    },
                })
                .render('#paypal-button-container');
        };

        let script = Array.from(document.scripts).find((s) => s.src === src);
        if (script && (window as any).paypal) {
            render();
        } else {
            if (!script) {
                script = document.createElement('script');
                script.src = src;
                script.async = true;
                document.body.appendChild(script);
            }
            script.addEventListener('load', render);
        }

        return () => {
            cancelled = true;
            script?.removeEventListener('load', render);
        };
    }, [clientId, currency, total, orderId, captureUrl, invoiceUrl]);

    return <div id="paypal-button-container" ref={container}></div>;
}
