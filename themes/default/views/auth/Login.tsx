import { Hook } from '@/components/Hook';
import { setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { Logo } from '../../components/Logo';
import { LoginForm } from './LoginForm';

/** Port of views/auth/login.blade.php */
export default function Login() {
    const providers = ['github', 'google', 'discord'].filter((p) => setting(`oauth_${p}`));
    return (
        <LoginForm
            logo={<Logo className="h-10" />}
            hook={<Hook name="auth.login" />}
            captcha={{ provider: setting<string | null>('captcha'), siteKey: String(setting('captcha_site_key') ?? '') }}
            providers={providers}
            registrationEnabled={!setting('registration_disabled', false)}
            links={{
                passwordRequest: relativeUrl(route('password.request')),
                register: relativeUrl(route('register')),
                oauth: Object.fromEntries(providers.map((p) => [p, relativeUrl(route('oauth.redirect', { provider: p }))])),
            }}
        />
    );
}
