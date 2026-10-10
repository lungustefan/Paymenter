'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTheme } from './useTheme';

declare global {
    interface Window {
        grecaptcha?: any;
        hcaptcha?: any;
        turnstile?: any;
        __captchaOnload?: () => void;
    }
}

export interface CaptchaHandle {
    reset: () => void;
    /** recaptcha v3: obtain a token right before submitting */
    execute: () => Promise<string | null>;
}

function loadScript(src: string): Promise<void> {
    return new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        document.head.appendChild(s);
    });
}

/** Port of components/captcha/*.blade.php (reCAPTCHA v2/v3, Turnstile, hCaptcha) */
export const Captcha = forwardRef<CaptchaHandle, { provider: string | null; siteKey: string; onToken: (token: string) => void; error?: string[] }>(function Captcha(
    { provider, siteKey, onToken, error },
    ref,
) {
    const el = useRef<HTMLDivElement>(null);
    const widget = useRef<any>(null);
    const dark = useTheme();

    useEffect(() => {
        if (!provider || provider === 'disabled') return;
        let cancelled = false;
        const render = () => {
            if (cancelled || !el.current) return;
            if (provider === 'recaptcha-v2' && window.grecaptcha?.render && widget.current === null) {
                widget.current = window.grecaptcha.render(el.current, { sitekey: siteKey, callback: onToken });
            } else if (provider === 'hcaptcha' && window.hcaptcha?.render && widget.current === null) {
                widget.current = window.hcaptcha.render(el.current, { sitekey: siteKey, callback: onToken });
            } else if (provider === 'turnstile' && window.turnstile?.render && widget.current === null) {
                widget.current = window.turnstile.render(el.current, { sitekey: siteKey, size: 'flexible', theme: dark ? 'dark' : 'light', callback: onToken });
            }
        };
        (async () => {
            if (provider === 'recaptcha-v2') {
                await loadScript('https://www.google.com/recaptcha/api.js?render=explicit');
                window.grecaptcha?.ready?.(render);
            } else if (provider === 'recaptcha-v3') {
                await loadScript(`https://www.google.com/recaptcha/api.js?render=${siteKey}`);
            } else if (provider === 'hcaptcha') {
                await loadScript('https://js.hcaptcha.com/1/api.js?render=explicit');
                const wait = setInterval(() => {
                    if (window.hcaptcha?.render) {
                        clearInterval(wait);
                        render();
                    }
                }, 100);
            } else if (provider === 'turnstile') {
                await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
                const wait = setInterval(() => {
                    if (window.turnstile?.render) {
                        clearInterval(wait);
                        render();
                    }
                }, 100);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, siteKey]);

    useImperativeHandle(ref, () => ({
        reset() {
            if (provider === 'recaptcha-v2') window.grecaptcha?.reset(widget.current ?? undefined);
            else if (provider === 'hcaptcha') window.hcaptcha?.reset(widget.current ?? undefined);
            else if (provider === 'turnstile') window.turnstile?.reset(widget.current ?? undefined);
        },
        async execute() {
            if (provider !== 'recaptcha-v3') return null;
            return new Promise<string | null>((resolve) => {
                window.grecaptcha.ready(() => {
                    window.grecaptcha.execute(siteKey, { action: 'submit' }).then((token: string) => {
                        onToken(token);
                        resolve(token);
                    });
                });
            });
        },
    }));

    if (!provider || provider === 'disabled') return null;

    return (
        <div className="flex flex-col justify-center mt-2">
            <div>
                <div ref={el} id={provider === 'turnstile' ? 'cf-turnstile' : provider === 'hcaptcha' ? 'h-captcha' : 'g-recaptcha'} data-sitekey={siteKey}></div>
            </div>
            {error?.[0] && <p className="text-red-500 text-xs mt-1">{error[0]}</p>}
        </div>
    );
});
