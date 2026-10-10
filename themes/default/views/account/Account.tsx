import { getCurrentUser } from '@/server/auth/session';
import { initializeProperties } from '@/server/support/properties';
import { Breadcrumb } from '../../components/Breadcrumb';
import { serializeProperties } from '../../components/propertiesData';
import { AccountForm } from './AccountForm';

/** Port of views/client/account/index.blade.php */
export default async function Account() {
    const user = (await getCurrentUser())!;
    const { customProperties, properties } = await initializeProperties(user, 'App\\Models\\User');
    return (
        <AccountForm
            breadcrumb={<Breadcrumb />}
            initial={{ first_name: user.first_name as string, last_name: user.last_name as string, email: user.email as string }}
            customProperties={serializeProperties(customProperties)}
            initialProperties={properties}
        />
    );
}
