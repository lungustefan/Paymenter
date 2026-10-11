import { ThemedPage } from '@/components/ThemedPage';
import { initRequest } from '@/server/page';

/** rendered per request: the theme layout reads settings, categories and the session from the database */
export const dynamic = 'force-dynamic';

/** `errors/404.blade.php` - rendered inside the theme's layout for every unknown page */
export default async function NotFound() {
    await initRequest();
    return <ThemedPage view="errors.404" />;
}
