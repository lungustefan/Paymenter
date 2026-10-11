import { once } from '@/server/request-store';
import { getRequestInfo } from '@/server/request';
import { config, setting } from '@/server/config';
import { forgetCookie, getCookie, setCookie } from '@/server/cookies';
import { sessionForget, sessionGet, sessionPut, sessionFlush } from '@/server/session';
import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { Carbon } from '@/server/lib/carbon';
import { sha256 } from '@/server/lib/crypto';
import { User } from '@/server/models/User';
import { UserSession } from '@/server/models/UserSession';
import { setAuditUserResolver } from './audit-user';

/**
 * Authentication, equivalent of the `ResolveUserSession` + `ImpersonateMiddleware`
 * + `LockSession` middleware and the `Login` / `Logout` actions.
 *
 * Identity is a `user_sessions` row (ULID). The ULID travels in the encrypted
 * `paymenter_session` cookie and, for "remember me" logins, also in the
 * `paymenter_remember` cookie - exactly like the PHP release.
 */

const REMEMBER_COOKIE = 'paymenter_remember';

interface Resolved {
    token: UserSession | null;
    /** the logged in user (real identity - the admin when impersonating) */
    user: User | null;
}

async function resolve(): Promise<Resolved> {
    return once('auth:resolved', async () => {
        let token: UserSession | null = null;

        const fromSession = await sessionGet<string | null>('user_session', null);
        if (fromSession) token = await UserSession.findValid(fromSession);

        if (!token) {
            const id = await getCookie(REMEMBER_COOKIE);
            if (id) token = await UserSession.findValid(id);
        }

        let user: User | null = null;
        if (token) {
            user = await token.rel('user');
            if (user) {
                const req = await getRequestInfo();
                try {
                    await token.touchRequest(req.ip, req.userAgent);
                } catch {
                    /* never block a page because the activity update failed */
                }
                if ((await sessionGet('user_session', null)) !== token.ulid) await sessionPut('user_session', token.ulid);
            }
        }
        return { token: user ? token : null, user };
    });
}

/** The user that is actually logged in (even when impersonating someone). */
export async function getAuthUser(): Promise<User | null> {
    return (await resolve()).user;
}

export async function getUserSession(): Promise<UserSession | null> {
    return (await resolve()).token;
}

async function isAdminPath(): Promise<boolean> {
    try {
        const { headers } = await import('next/headers');
        const path = (await headers()).get('x-paymenter-path') ?? '';
        return path === '/admin' || path.startsWith('/admin/');
    } catch {
        return false;
    }
}

/**
 * The user the current page acts as: the impersonated customer when an admin is
 * impersonating (client area only), otherwise the logged in user.
 */
export async function getCurrentUser(): Promise<User | null> {
    return once('auth:current', async () => {
        const real = await getAuthUser();
        if (!real) return null;
        const impersonating = await sessionGet<number | null>('impersonating', null);
        if (impersonating && !(await isAdminPath())) {
            // Validate if admin user still has permission to impersonate
            if (!(await real.hasPermission('admin.users.impersonate'))) return real;
            const target = await User.find<User>(impersonating);
            return target ?? real;
        }
        return real;
    });
}

export async function getCurrentUserId(): Promise<number | null> {
    return (await getCurrentUser())?.id ?? null;
}

export async function isImpersonating(): Promise<boolean> {
    const real = await getAuthUser();
    return !!real && !!(await sessionGet('impersonating', null)) && !(await isAdminPath());
}

/** Registered for auditing: who made the change (the real user, not the impersonated one). */
setAuditUserResolver(async () => (await getAuthUser())?.id ?? null);

/** Port of App\Actions\Auth\Login */
export async function login(user: User, remember = false): Promise<UserSession> {
    const req = await getRequestInfo();
    const userSession = await UserSession.create({
        user_id: user.id,
        ip_address: req.ip,
        user_agent: (req.userAgent ?? '').slice(0, 512),
        last_activity: Carbon.now(),
        expires_at: remember ? Carbon.now().addDays(30) : null,
    });
    await sessionPut('user_session', userSession.ulid);
    if (remember) await setCookie(REMEMBER_COOKIE, userSession.ulid, { minutes: 60 * 24 * 30 }); // 30 days
    await dispatch(Events.Auth.Login, { user });
    return userSession;
}

/** Port of App\Actions\Auth\Logout */
export async function logout(): Promise<void> {
    const token = await sessionGet<string | null>('user_session', null);
    if (token) {
        const row = await UserSession.query().where('ulid', token).first();
        if (row) await row.delete();
    }
    const remember = await getCookie(REMEMBER_COOKIE);
    if (remember) await UserSession.query().where('ulid', remember).delete();
    await sessionFlush();
    await forgetCookie(REMEMBER_COOKIE);
    await dispatch('Illuminate\\Auth\\Events\\Logout', {});
}

/**
 * `LockSession` middleware: when a session validation mode is set, lock a session
 * to its login IP and/or User-Agent. Returns false when the session must be dropped.
 */
export async function validateSessionLock(user: User): Promise<boolean> {
    const mode = setting<string>('session_validation', 'none');
    if (mode === 'none') return true;
    const isAdmin = user.role_id !== null && user.role_id !== undefined;
    const ipModes = {
        admin: ['ip_admin', 'ip_both', 'ip_user_agent_admin', 'ip_user_agent_both'],
        client: ['ip_client', 'ip_both', 'ip_user_agent_client', 'ip_user_agent_both'],
    };
    const uaModes = {
        admin: ['user_agent_admin', 'user_agent', 'ip_user_agent_admin', 'ip_user_agent_both'],
        client: ['user_agent_client', 'user_agent', 'ip_user_agent_client', 'ip_user_agent_both'],
    };
    const role = isAdmin ? 'admin' : 'client';
    const req = await getRequestInfo();

    const check = async (key: string, value: string) => {
        const stored = await sessionGet<string | null>(key, null);
        if (stored === null) {
            await sessionPut(key, value);
            return true;
        }
        return stored === value;
    };
    if (ipModes[role].includes(mode) && !(await check('login_ip', req.ip ?? ''))) return false;
    if (uaModes[role].includes(mode) && !(await check('login_ua', sha256(req.userAgent ?? '')))) return false;
    return true;
}

export { REMEMBER_COOKIE, sessionForget };
void config;
