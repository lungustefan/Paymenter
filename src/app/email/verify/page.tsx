import { redirect } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

export default async function VerifyEmailPage() {
    const user = await requireUser();
    if (user.hasVerifiedEmail()) redirect('/dashboard');
    return <ThemedPage view="auth.verify-email" />;
}
