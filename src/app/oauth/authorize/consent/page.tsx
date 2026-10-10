import { notFound } from 'next/navigation';
import { ThemedPage } from '@/components/ThemedPage';
import { requireUser } from '@/server/page';
import { pageMeta } from '@/server/meta';
import { consentViewData } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';
export const generateMetadata = async () => pageMeta();

/** The consent screen of `GET /oauth/authorize` (`vendor.passport.authorize`). The pending request is kept in the session. */
export default async function AuthorizePage() {
    await requireUser();
    const data = await consentViewData();
    if (!data) notFound();
    return <ThemedPage view="vendor.passport.authorize" props={data} />;
}
