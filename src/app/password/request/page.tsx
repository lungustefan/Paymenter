import { ThemedPage } from '@/components/ThemedPage';
import { requireGuest } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

export default async function PasswordRequestPage() {
    await requireGuest();
    return <ThemedPage view="auth.password.request" />;
}
