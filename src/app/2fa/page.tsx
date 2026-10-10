import { redirect } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { requireGuest } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { sessionGet } from '@/server/session';
import { Carbon } from '@/server/lib/carbon';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

export default async function TfaPage() {
    await requireGuest();
    const session = await sessionGet<{ expires: string } | null>('2fa', null);
    if (!session || Carbon.parse(session.expires).lt(Carbon.now())) redirect('/login');
    return <ThemedPage view="auth.2fa" />;
}
