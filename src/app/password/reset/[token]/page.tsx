import { notFound } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { requireGuest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { User } from '@/server/models/User';
import { Password } from '@/server/auth/passwords';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

export default async function PasswordResetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ email?: string }> }) {
    await requireGuest();
    const { token } = await params;
    const { email } = await searchParams;
    if (!token || email === undefined) notFound();

    // Validate token
    const user = await User.query().where('email', email).first();
    if (!user || !(await Password.tokenExists(user, token))) notFound();

    return <ThemedPage view="auth.password.reset" props={{ token, email }} />;
}
