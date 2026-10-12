import type { Model } from '@/server/orm';
import { setting } from '@/server/config';
import type { User } from '@/server/models/User';

/**
 * Ports of app/Policies/*: what `$user->can($ability, $model)` / `Gate::allows()` answer.
 * Every ability maps to an `admin.<prefix>.<ability>` permission of the user's role (`*` allows all);
 * `overrides` hold the abilities that differ from that rule.
 */

type ModelClass = { morphName?: string } & (abstract new (...args: any[]) => any);
type Check = string | ((user: User, record: Model<any> | null) => boolean | Promise<boolean>);

interface PolicyDef {
    /** `admin.<prefix>.<ability>` */
    prefix: string;
    /** abilities the policy defines (a missing method in PHP denies) */
    abilities: string[];
    overrides?: Record<string, Check>;
}

const CRUD = ['viewAny', 'view', 'create', 'update', 'delete', 'deleteAny'];

const policies: Record<string, PolicyDef> = {
    AdjustmentNote: { prefix: 'adjustment_notes', abilities: CRUD, overrides: { view: 'admin.adjustment_notes.viewAny' } },
    ApiKey: { prefix: 'api_keys', abilities: CRUD },
    Audit: { prefix: 'audit', abilities: ['viewAny', 'view'], overrides: { view: 'admin.audit.viewAny' } },
    BillingAgreement: { prefix: 'billing_agreements', abilities: ['viewAny', 'view'], overrides: { view: 'admin.billing_agreements.viewAny' } },
    Category: { prefix: 'categories', abilities: CRUD },
    ConfigOption: { prefix: 'config_options', abilities: CRUD },
    Coupon: { prefix: 'coupons', abilities: CRUD },
    Credit: { prefix: 'credits', abilities: ['viewAny', 'view', 'create', 'update', 'delete'], overrides: { view: 'admin.credits.viewAny' } },
    Currency: { prefix: 'currencies', abilities: CRUD },
    CustomProperty: { prefix: 'custom_properties', abilities: CRUD },
    EmailLog: { prefix: 'email_logs', abilities: ['viewAny', 'view'] },
    Extension: { prefix: 'extensions', abilities: ['viewAny', 'view', 'update', 'install', 'delete'] },
    FailedJob: { prefix: 'failed_jobs', abilities: ['viewAny'] },
    Gateway: { prefix: 'gateways', abilities: CRUD },
    // with immutable invoices only a draft can be updated
    Invoice: {
        prefix: 'invoices',
        abilities: CRUD,
        overrides: {
            update: async (user, record) => {
                if (!(await user.hasPermission('admin.invoices.update'))) return false;
                if (!record || !setting('immutable_invoices_enabled', false)) return true;
                return (record as any).status === 'draft';
            },
        },
    },
    InvoiceTransaction: { prefix: 'invoice_transactions', abilities: CRUD },
    NotificationTemplate: { prefix: 'notification_templates', abilities: CRUD },
    OauthClient: { prefix: 'oauth_clients', abilities: CRUD },
    Order: { prefix: 'orders', abilities: CRUD },
    Product: { prefix: 'products', abilities: CRUD },
    Role: { prefix: 'roles', abilities: CRUD },
    Server: { prefix: 'servers', abilities: CRUD },
    ServiceCancellation: { prefix: 'service_cancellations', abilities: CRUD },
    Service: { prefix: 'services', abilities: CRUD },
    TaxRate: { prefix: 'tax_rates', abilities: CRUD },
    Ticket: { prefix: 'tickets', abilities: CRUD },
    TicketMessage: { prefix: 'ticket_messages', abilities: ['delete'] },
    User: { prefix: 'users', abilities: CRUD },
};

/** `HasPermission` gate: `Gate::allows('has-permission', 'admin.foo.bar')` */
export async function hasPermission(user: User | null, permission: string): Promise<boolean> {
    return !!user && (await user.hasPermission(permission));
}

/**
 * `$user->can($ability, Model::class | $model)` inside the admin panel
 * (`BasePolicy::adminPermission()` answers with the permission, not the ownership condition).
 */
export async function can(user: User | null, ability: string, subject: ModelClass | Model<any> | string): Promise<boolean> {
    if (!user) return false;
    // (class names do not survive minification: the morph name `App\\Models\\Invoice` identifies the model)
    const morph = typeof subject === 'string' ? subject : ((subject as any).morphName ?? (subject as any).constructor?.morphName ?? '');
    const name = String(morph).split('\\').pop() as string;
    const policy = policies[name];
    if (!policy || !policy.abilities.includes(ability)) return false;
    const check = policy.overrides?.[ability];
    if (typeof check === 'function') return check(user, typeof subject === 'object' && typeof subject !== 'string' ? (subject as Model<any>) : null);
    return user.hasPermission(check ?? `admin.${policy.prefix}.${ability}`);
}

/**
 * Filament's authorization: a model without a policy (or a policy without the method) is not restricted
 * (`Gate::getPolicyFor($model) === null` skips the check).
 */
export async function canFilament(user: User | null, ability: string, subject: ModelClass | Model<any> | string): Promise<boolean> {
    if (!user) return false;
    const morph = typeof subject === 'string' ? subject : ((subject as any).morphName ?? (subject as any).constructor?.morphName ?? '');
    const policy = policies[String(morph).split('\\').pop() as string];
    if (!policy || !policy.abilities.includes(ability)) return true;
    return can(user, ability, subject);
}

export function policyFor(name: string): PolicyDef | undefined {
    return policies[name];
}

/** `Gate::policy(Model::class, Policy::class)` for the models of extensions. */
export function registerPolicy(modelName: string, def: PolicyDef) {
    policies[modelName] = def;
}
