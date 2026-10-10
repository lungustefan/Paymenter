import { randomBytes, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { currentDb } from '@/server/orm/context';
import { passwordResetTokens } from '@/server/db/schema';
import { appKeys, checkPassword, hashPassword } from '@/server/lib/crypto';
import { Carbon } from '@/server/lib/carbon';
import { User } from '@/server/models/User';

/** Port of Laravel's `Password` broker (DatabaseTokenRepository, 60 minute expiry). */
const EXPIRE_MINUTES = 60;

export const PASSWORD_RESET = 'passwords.reset';
export const INVALID_TOKEN = 'passwords.token';
export const INVALID_USER = 'passwords.user';

export const Password = {
    async createToken(user: User): Promise<string> {
        const db = currentDb();
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, user.email));
        const token = createHmac('sha256', appKeys()[0]).update(randomBytes(30).toString('hex').slice(0, 40)).digest('hex');
        await db.insert(passwordResetTokens).values({ email: user.email, token: hashPassword(token), created_at: Carbon.now() } as any);
        return token;
    },

    async tokenExists(user: User, token: string): Promise<boolean> {
        const rows = await currentDb().select().from(passwordResetTokens).where(eq(passwordResetTokens.email, user.email)).limit(1);
        const record = rows[0] as any;
        if (!record) return false;
        const created = record.created_at ? Carbon.parse(record.created_at) : null;
        if (!created || created.copy().addMinutes(EXPIRE_MINUTES).isPast()) return false;
        return checkPassword(token, record.token);
    },

    async deleteToken(user: User) {
        await currentDb().delete(passwordResetTokens).where(eq(passwordResetTokens.email, user.email));
    },

    /** `Password::reset()`: returns the status key (`passwords.reset` on success). */
    async reset(credentials: { email: string; token: string }, callback: (user: User) => Promise<void>): Promise<string> {
        const user = await User.query().where('email', credentials.email).first();
        if (!user) return INVALID_USER;
        if (!(await Password.tokenExists(user, credentials.token))) return INVALID_TOKEN;
        await callback(user);
        await Password.deleteToken(user);
        return PASSWORD_RESET;
    },
};
