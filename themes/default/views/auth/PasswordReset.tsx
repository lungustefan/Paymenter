import { setting } from '@/server/config';
import { Logo } from '../../components/Logo';
import { PasswordResetForm } from './PasswordForms';

/** Port of views/auth/password/reset.blade.php */
export default function PasswordReset({ token, email }: { token: string; email: string }) {
    return <PasswordResetForm logo={<Logo className="h-10" />} captcha={{ provider: setting<string | null>('captcha'), siteKey: String(setting('captcha_site_key') ?? '') }} token={token} email={email} />;
}
