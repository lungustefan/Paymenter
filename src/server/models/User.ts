import { Model, belongsTo, hasMany, hasOne, hasManyThrough } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { users } from '@/server/db/schema';
import { md5 } from '@/server/lib/crypto';
import { setting } from '@/server/config';
import type { Row } from './_types';
import { Role } from './Role';
import type { UserSession } from './UserSession';
import { UserSession as UserSessionModel } from './UserSession';
import type { Order } from './Order';
import { Order as OrderModel } from './Order';
import type { Service } from './Service';
import { Service as ServiceModel } from './Service';
import type { Invoice } from './Invoice';
import { Invoice as InvoiceModel } from './Invoice';
import type { Ticket } from './Ticket';
import { Ticket as TicketModel } from './Ticket';
import type { Credit } from './Credit';
import { Credit as CreditModel } from './Credit';
import type { Cart } from './Cart';
import { Cart as CartModel } from './Cart';
import type { BillingAgreement } from './BillingAgreement';
import { BillingAgreement as BillingAgreementModel } from './BillingAgreement';
import type { InvoiceTransaction } from './InvoiceTransaction';
import { InvoiceTransaction as InvoiceTransactionModel } from './InvoiceTransaction';
import type { Notification } from './Notification';
import { Notification as NotificationModel } from './Notification';
import type { NotificationPreference } from './NotificationPreference';
import { NotificationPreference as NotificationPreferenceModel } from './NotificationPreference';
import type { NotificationSubscription } from './NotificationSubscription';
import { NotificationSubscription as NotificationSubscriptionModel } from './NotificationSubscription';
import type { UserAuthenticationLog } from './UserAuthenticationLog';
import { UserAuthenticationLog as UserAuthenticationLogModel } from './UserAuthenticationLog';
import type { Property } from './Property';
import { Property as PropertyModel } from './Property';
import { morphMany } from '@/server/orm';

export interface User extends Row<typeof users> {}

export interface UserRelations {
    role: Role | null;
    sessions: UserSession[];
    orders: Order[];
    services: Service[];
    invoices: Invoice[];
    tickets: Ticket[];
    credits: Credit[];
    cart: Cart | null;
    billingAgreements: BillingAgreement[];
    transactions: InvoiceTransaction[];
    notifications: Notification[];
    notificationsPreferences: NotificationPreference[];
    pushSubscriptions: NotificationSubscription[];
    authenticationLogs: UserAuthenticationLog[];
    properties: Property[];
}

export class User extends Model<UserRelations> {
    static table = users;
    static morphName = 'App\\Models\\User';
    static fillable = ['first_name', 'last_name', 'email', 'password', 'role_id', 'tfa_secret', 'email_verified_at'];
    static hidden = ['password', 'remember_token', 'tfa_secret'];
    static casts = { password: 'hashed', tfa_secret: 'encrypted' };
    static auditable = true;
    static accessors = ['initials', 'avatar', 'name'];

    static relations: Record<string, RelationDef> = {
        role: belongsTo(() => Role, 'role_id'),
        sessions: hasMany(() => UserSessionModel, 'user_id'),
        orders: hasMany(() => OrderModel, 'user_id'),
        services: hasMany(() => ServiceModel, 'user_id'),
        invoices: hasMany(() => InvoiceModel, 'user_id'),
        tickets: hasMany(() => TicketModel, 'user_id'),
        credits: hasMany(() => CreditModel, 'user_id'),
        cart: hasOne(() => CartModel, 'user_id'),
        billingAgreements: hasMany(() => BillingAgreementModel, 'user_id'),
        transactions: hasManyThrough(() => InvoiceTransactionModel, () => InvoiceModel, 'user_id', 'invoice_id', 'id', 'id'),
        notifications: hasMany(() => NotificationModel, 'user_id'),
        notificationsPreferences: hasMany(() => NotificationPreferenceModel, 'user_id'),
        pushSubscriptions: hasMany(() => NotificationSubscriptionModel, 'user_id'),
        authenticationLogs: hasMany(() => UserAuthenticationLogModel, 'user_id'),
        properties: morphMany(() => PropertyModel, 'model'),
    };

    /** Initials of the user. */
    async initials(): Promise<string> {
        return ((this.first_name ?? '').slice(0, 1) + (this.last_name ?? '').slice(0, 1)).toUpperCase();
    }

    /** Gravatar URL. */
    async avatar(): Promise<string> {
        return `https://www.gravatar.com/avatar/${md5(this.email.toLowerCase())}?d=${encodeURIComponent(String(setting('gravatar_default') ?? ''))}`;
    }

    avatarUrl(): string {
        return `https://www.gravatar.com/avatar/${md5(this.email.toLowerCase())}?d=${encodeURIComponent(String(setting('gravatar_default') ?? ''))}`;
    }

    /** Display name (falls back to the email when empty). */
    async name(): Promise<string> {
        return this.displayName();
    }

    displayName(): string {
        // PHP: `($this->first_name . ' ' . $this->last_name) ?: $this->email` - the concatenation always contains
        // a space and is therefore truthy, so the email fallback never triggers.
        return `${this.first_name ?? ''} ${this.last_name ?? ''}`;
    }

    async hasPermission(permission: string): Promise<boolean> {
        const role = await this.rel('role');
        if (!role) return false;
        const permissions = (role.permissions ?? []) as string[];
        if (permissions.includes('*')) return true;
        return permissions.includes(permission);
    }

    /** `canAccessPanel`: any user with a role may enter the admin panel. */
    async canAccessAdmin(): Promise<boolean> {
        return this.role_id !== null && this.role_id !== undefined && !!(await this.rel('role'));
    }

    hasVerifiedEmail(): boolean {
        return this.email_verified_at !== null && this.email_verified_at !== undefined;
    }

    async markEmailAsVerified(): Promise<void> {
        const { Carbon } = await import('@/server/lib/carbon');
        this.email_verified_at = Carbon.now();
        await this.save();
    }
}
