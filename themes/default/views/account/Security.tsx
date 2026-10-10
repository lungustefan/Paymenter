import { getCurrentUser } from '@/server/auth/session';
import { sessionGet } from '@/server/session';
import { Breadcrumb } from '../../components/Breadcrumb';
import { ChangePassword, SessionsList, TwoFactor, type SessionView } from './SecurityClient';

/** Port of views/client/account/security.blade.php */
export default async function Security() {
    const user = (await getCurrentUser())!;
    const current = await sessionGet<string | null>('user_session', null);
    const sessions: SessionView[] = (await user.rel('sessions')).map((s) => ({
        id: s.id as number,
        ip: s.ip_address as string,
        activity: s.last_activity?.diffForHumans() ?? '',
        device: s.formattedDevice,
        current: s.ulid === current,
    }));
    return (
        <div className="container mt-14">
            <Breadcrumb />
            <div className="px-2 flex flex-col gap-4">
                <SessionsList sessions={sessions} />
                <ChangePassword />
                <TwoFactor enabled={!!user.tfa_secret} />
            </div>
        </div>
    );
}
