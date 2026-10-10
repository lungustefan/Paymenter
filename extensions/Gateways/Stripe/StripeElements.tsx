'use client';

import { useEffect, useRef } from 'react';

/**
 * resources/views/pay.blade.php and billing-agreement.blade.php of the Stripe gateway:
 * the Stripe Payment Element inside the payment modal (`mode="payment"`) or the
 * "add payment method" modal (`mode="setup"`).
 */
export default function StripeElements({
    mode,
    publishableKey,
    clientSecret,
    name,
    email,
    returnUrl,
}: {
    mode: 'payment' | 'setup';
    publishableKey: string;
    clientSecret: string;
    name: string;
    email: string;
    returnUrl: string;
}) {
    const form = useRef<HTMLFormElement>(null);
    const errorMessage = useRef<HTMLDivElement>(null);
    const submit = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        let destroyed = false;
        let paymentElement: any = null;
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        const src = 'https://js.stripe.com/v3/';

        const setLoading = (isLoading: boolean) => {
            if (!submit.current) return;
            // Show a spinner on payment submission
            submit.current.disabled = isLoading;
            submit.current.classList.toggle('hidden', isLoading);
        };

        const showMessage = (messageText: string) => {
            const container = errorMessage.current;
            if (!container) return;
            container.classList.remove('hidden');
            container.textContent = messageText;

            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                container.classList.add('hidden');
                container.textContent = '';
            }, 4000);
        };

        const mount = () => {
            const Stripe = (window as any).Stripe;
            if (destroyed || !Stripe || !form.current) return;

            const stripe = Stripe(publishableKey);

            const options = {
                clientSecret,
                appearance: {
                    theme: 'night',
                },
            };

            const paymentElementOptions = {
                layout: {
                    type: 'accordion',
                    defaultCollapsed: false,
                    radios: false,
                    spacedAccordionItems: true,
                },
                defaultValues: {
                    billingDetails: {
                        name,
                        email,
                    },
                },
            };

            // Set up Stripe.js and Elements to use in checkout form, passing the client secret obtained in a previous step
            const elements = stripe.elements(options);
            paymentElement = elements.create('payment', paymentElementOptions);
            paymentElement.mount('#payment-element');

            form.current.addEventListener('submit', async (event) => {
                event.preventDefault();
                setLoading(true);

                if (mode === 'payment') {
                    const { error } = await stripe.confirmPayment({
                        //`Elements` instance that was used to create the Payment Element
                        elements,
                        confirmParams: {
                            return_url: returnUrl,
                        },
                    });

                    // This point will only be reached if there is an immediate error when
                    // confirming the payment. Otherwise, your customer will be redirected to
                    // your `return_url`. For some payment methods like iDEAL, your customer will
                    // be redirected to an intermediate site first to authorize the payment, then
                    // redirected to the `return_url`.
                    if (error.type === 'card_error' || error.type === 'validation_error') {
                        showMessage(error.message);
                    } else {
                        showMessage('An unexpected error occurred.');
                    }

                    setLoading(false);
                } else {
                    await stripe.confirmSetup({
                        elements,
                        confirmParams: {
                            return_url: returnUrl,
                        },
                    });
                }
            });
        };

        let script = Array.from(document.scripts).find((s) => s.src === src);
        if (script && (window as any).Stripe) {
            mount();
        } else {
            if (!script) {
                script = document.createElement('script');
                script.src = src;
                script.async = true;
                document.body.appendChild(script);
            }
            script.addEventListener('load', mount);
        }

        return () => {
            destroyed = true;
            clearTimeout(hideTimer);
            script?.removeEventListener('load', mount);
            // `invoice.payment.cancelled`: destroy the payment element
            try {
                paymentElement?.destroy();
            } catch {
                /* already gone */
            }
        };
    }, [mode, publishableKey, clientSecret, name, email, returnUrl]);

    return (
        <form id="payment-form" className="mt-2 text-white" ref={form}>
            <div id="error-message" className="hidden text-red-500 mb-2" ref={errorMessage}></div>
            <div id="payment-element"></div>
            <button
                id="submit"
                ref={submit}
                className="mt-4 bg-secondary-500 text-white hover:bg-secondary py-2 px-4 rounded-md w-full bg-gradient-to-tr from-secondary via-50% via-20% via-secondary to-[#5573FD80] duration-300"
            >
                {mode === 'payment' ? 'Pay' : 'Authorize'}
            </button>
        </form>
    );
}
