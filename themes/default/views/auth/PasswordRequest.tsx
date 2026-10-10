import { setting } from '@/server/config';
import { Logo } from '../../components/Logo';
import { PasswordRequestForm } from './PasswordForms';

/** Port of views/auth/password/request.blade.php */
export default function PasswordRequest() {
    return <PasswordRequestForm logo={<Logo className="h-10" />} captcha={{ provider: setting<string | null>('captcha'), siteKey: String(setting('captcha_site_key') ?? '') }} />;
}
