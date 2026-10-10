import { initRequest } from '@/server/page';

/** the signed-in user, who must be allowed into the panel (`canAccessPanel`) */
export async function requireAdminUser() {
    const { user } = await initRequest();
    if (!user || !(await user.canAccessAdmin())) throw new Error('Unauthorized');
    return user;
}
