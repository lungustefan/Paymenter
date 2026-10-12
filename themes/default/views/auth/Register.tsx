import { setting } from '@/server/config';
import { route, relativeUrl } from '@/server/routes';
import { initializeProperties } from '@/server/support/properties';
import { Logo } from '../../components/Logo';
import { RegisterForm } from './RegisterForm';
import { serializeProperties } from '../../components/propertiesData';

/** Port of views/auth/register.blade.php */
export default async function Register() {
    const { customProperties, properties } = await initializeProperties(null, 'App\\Models\\User');
    return (
        <RegisterForm
            logo={<Logo className="h-10" />}
            captcha={{ provider: setting<string | null>('captcha'), siteKey: String(setting('captcha_site_key') ?? '') }}
            customProperties={serializeProperties(customProperties)}
            initialProperties={properties}
            tos={setting<string | null>('tos') || null}
            loginUrl={relativeUrl(route('login'))}
        />
    );
}
