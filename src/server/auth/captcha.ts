import { Http } from '@/server/http';
import { setting } from '@/server/config';
import { ValidationError } from '@/server/validation';
import { getRequestInfo } from '@/server/request';

/** Port of App\Traits\Captchable::captcha() */
export async function verifyCaptcha(token: string | null | undefined): Promise<void> {
    const provider = setting<string | null>('captcha');
    if (!provider || provider === 'disabled') return;

    if (!token) throw new ValidationError({ captcha: ['The CAPTCHA is required.'] });

    const { ip } = await getRequestInfo();
    const secret = setting('captcha_secret');
    const post = async (url: string, extra: Record<string, unknown> = {}) => {
        const res = await Http.asForm().acceptJson().post(url, { secret, response: token, remoteip: ip, ...extra });
        return !!res.json()?.success;
    };

    let valid = false;
    if (provider === 'turnstile') {
        const key = Math.random().toString(16).slice(2);
        valid = (await post('https://challenges.cloudflare.com/turnstile/v0/siteverify', { idempotency_key: key })) ||
            (await post('https://challenges.cloudflare.com/turnstile/v0/siteverify', { idempotency_key: key }));
    } else if (provider === 'hcaptcha') {
        valid = await post('https://api.hcaptcha.com/siteverify');
    } else if (provider === 'recaptcha-v2' || provider === 'recaptcha-v3') {
        valid = await post('https://www.google.com/recaptcha/api/siteverify');
    }
    if (!valid) throw new ValidationError({ captcha: ['The CAPTCHA was invalid.'] });
}
