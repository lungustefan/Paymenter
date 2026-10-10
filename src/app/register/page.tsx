import { ThemedPage } from '@/components/ThemedPage';
import { disabledIf, requireGuest } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

export default async function RegisterPage() {
    await requireGuest();
    await disabledIf('registration_disabled');
    return <ThemedPage view="auth.register" />;
}
