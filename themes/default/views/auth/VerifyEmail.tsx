import { setting } from '@/server/config';
import { VerifyEmailForm } from './VerifyEmailForm';

/** Port of views/auth/verify-email.blade.php */
export default function VerifyEmail() {
    return <VerifyEmailForm captcha={{ provider: setting<string | null>('captcha'), siteKey: String(setting('captcha_site_key') ?? '') }} />;
}
