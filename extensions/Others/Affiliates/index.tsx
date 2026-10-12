import path from 'node:path';
import { Extension } from '@/server/extensions/Extension';
import type { ConfigDefinition, ExtensionPage } from '@/server/extensions/types';
import type { Endpoint } from '@/server/api/admin';
import { ExtensionHelper } from '@/server/extensions/helper';
import { getCookie } from '@/server/cookies';
import { getAuthUser, isAdminPath } from '@/server/auth/session';
import { Events } from '@/server/event-defs';
import { listen } from '@/server/events';
import { registerLangNamespace, t } from '@/server/i18n';
import { getLocale } from '@/server/page';
import { Credit } from '@/server/models/Credit';
import { Extension as ExtensionModel } from '@/server/models/Extension';
import type { Invoice } from '@/server/models/Invoice';
import type { Service } from '@/server/models/Service';
import { resources } from '@/server/api/resources';
import type { ResourceDef } from '@/server/api/jsonapi';
import { Affiliate } from './Affiliate';
import { AffiliateOrder } from './AffiliateOrder';
import { REFERRED_BY } from './constants';
import { registerAffiliateRelation } from './relation';
import { AffiliatePage } from './views';

const migrations = 'extensions/Others/Affiliates/database/migrations';

/** the extension can be disabled while the process keeps running: listeners check it when they fire */
const enabled = async () => !!(await ExtensionModel.query().where('extension', 'Affiliates').where('enabled', true).first());

const permissions = () => ({
    'admin.affiliates.view': 'View Affiliates',
    'admin.affiliates.create': 'Create Affiliates',
    'admin.affiliates.update': 'Update Affiliates',
    'admin.affiliates.delete': 'Delete Affiliates',
});

/* Http/Resources/AffiliateOrderResource.php + AffiliateResource.php */
const affiliateOrderResource: ResourceDef = { type: 'extAffiliateOrders', attributes: ['id', 'order_id'] };
const affiliateResource: ResourceDef = {
    type: 'extAffiliates',
    attributes: ['id', 'code', 'enabled', 'visitors', 'reward', 'discount', 'earnings', 'updated_at', 'created_at'],
    relationships: { user: () => resources.user, orders: () => affiliateOrderResource },
};

export default class Affiliates extends Extension {
    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Record<string, any> = {}): ConfigDefinition[] {
        return [
            {
                name: 'default_reward',
                label: 'Default Affiliate Reward',
                type: 'number',
                description: 'Percentage of the purchase amount the affiliated user would receive as a reward.',
                required: true,
                suffix: '%',
                validation: 'integer|min:0|max:100',
            },
            {
                name: 'cookie_max_age',
                label: 'Referral Cookie Max-Age',
                type: 'number',
                description: 'Amount of days for which the referral cookie be valid. (Set 0 for infinite)',
                required: true,
                validation: 'integer|min:0',
            },
            {
                name: 'type',
                label: 'Affiliate Code Type',
                type: 'select',
                default: 'random',
                description: 'How the affiliate would be assigned.',
                required: true,
                options: {
                    random: 'Random',
                    custom: 'Custom',
                },
            },
        ];
    }

    async installed() {
        await ExtensionHelper.runMigrations(migrations);
    }

    async uninstalled() {
        // Rollback migrations
        await ExtensionHelper.rollbackMigrations(migrations);
    }

    boot() {
        registerLangNamespace('affiliates', path.join(process.cwd(), 'extensions/Others/Affiliates/resources/lang'));
        registerAffiliateRelation();

        if ((Affiliates as any).listening) return;
        (Affiliates as any).listening = true;

        // Listen for UserCreated and InvoicePaid events
        // (Listeners/IncreamentAffiliateSignups.php)
        listen(Events.User.Created, async () => {
            if (!(await enabled())) return;
            // Prevents users created by an admin (or while somebody is logged in) from counting as signups
            if ((await isAdminPath()) || (await getAuthUser())) return;
            const affiliate = await Affiliate.query()
                .where('code', (await getCookie(REFERRED_BY)) ?? '')
                .first();
            if (!affiliate) {
                return;
            }

            await affiliate.incrementColumn('signups');
        });

        // (Listeners/RewardAffiliate.php)
        listen(Events.Invoice.Paid, async ({ invoice }) => {
            if (!(await enabled())) return;
            await rewardAffiliate(invoice);
        });

        // (Listeners/AssociateOrderWithAffiliate.php)
        listen(Events.Order.Created, async ({ order }) => {
            if (!(await enabled())) return;
            // Prevents admin created orders from being associated with an affiliate
            if ((await isAdminPath()) || Number((await getAuthUser())?.id ?? 0) !== Number(order.user_id)) return;
            const affiliate = await Affiliate.query()
                .where('code', (await getCookie(REFERRED_BY)) ?? '')
                .first();
            if (!affiliate || (await affiliate.rel('user'))!.id === order.user_id) {
                return;
            }

            await AffiliateOrder.create({
                order_id: order.id,
                affiliate_id: affiliate.id,
            });
        });

        listen('api.permissions', async () => ((await enabled()) ? permissions() : undefined));

        listen('permissions', async () => ((await enabled()) ? permissions() : undefined));

        // Hook onto account navigation
        listen('navigation.account', async () => {
            if (!(await enabled())) return;
            return {
                name: t('affiliates::affiliate.affiliate', {}, await getLocale()),
                route: 'affiliate.index',
                priority: 15,
            };
        });
    }

    pages(): ExtensionPage[] {
        return [
            {
                name: 'affiliate.index',
                path: '/account/affiliate',
                auth: true,
                sidebar: true,
                async render({ user }) {
                    registerAffiliateRelation();
                    // Livewire\Affiliates\Affiliate::mount()
                    const affiliate = (await user!.rel('affiliate' as any)) as Affiliate | null;
                    const signupType = String((await ExtensionHelper.getExtension('other', 'Affiliates')).config('type'));
                    return <AffiliatePage affiliate={affiliate} signupType={signupType} />;
                },
            },
        ];
    }

    /** Http/Controllers/AffiliateController.php: `Route::apiResources(['affiliates' => AffiliateController::class])` */
    apiEndpoints(): Endpoint[] {
        return [
            {
                slug: 'affiliates',
                model: Affiliate,
                def: affiliateResource,
                permission: 'affiliates',
                includes: ['user', 'orders'],
                filters: ['affiliate_id', 'code', 'visitors', 'reward', 'discount'],
                sorts: ['id', 'code', 'visitors', 'reward', 'discount', 'created_at'],
                actions: ['index', 'show', 'store', 'update', 'destroy'],
                // the controller returns `new AffiliateResource($affiliate)`
                rawResponse: true,
                // the `earnings` attribute of the resource
                prepare: async (models) => {
                    for (const model of models) (model as any).earnings = await (model as Affiliate).earnings();
                },
                createRules: () => ({
                    user_id: 'required|exists:users,id',
                    code: 'required|string|max:255|unique:ext_affiliates,code',
                    enabled: 'nullable|boolean',
                    reward: 'nullable|numeric|min:0|max:100',
                }),
                updateRules: (record) => ({
                    user_id: 'nullable|exists:users,id',
                    code: `nullable|string|max:255|unique:ext_affiliates,code,${record.getKey()}`,
                    enabled: 'nullable|boolean',
                    reward: 'nullable|numeric|min:0|max:100',
                }),
            },
        ];
    }
}

/** Listeners/RewardAffiliate.php */
async function rewardAffiliate(invoice: Invoice): Promise<void> {
    const first = (await invoice.relation('items').first())!;
    if (first.reference_type !== 'App\\Models\\Service') {
        return;
    }
    const order = await ((await first.rel('reference')) as Service).rel('order');
    if (!order) {
        return;
    }
    const referral = await AffiliateOrder.query().where('order_id', order.id).first();

    if (!referral) {
        return;
    }

    const affiliate = (await referral.rel('affiliate'))!;
    const extension = await ExtensionHelper.getExtension('other', 'Affiliates');
    const rewardPercentage = affiliate.reward ? Number(affiliate.reward) : Number(extension.config('default_reward'));
    const rewardAmount = ((await invoice.total()) * rewardPercentage) / 100;

    const user = (await affiliate.rel('user'))!;
    const affiliateCredits = (await user.rel('credits')).find((credit) => credit.currency_code === invoice.currency_code);

    if (affiliateCredits) {
        // Add reward to credits
        await user.relation<Credit>('credits').where('currency_code', invoice.currency_code).update({
            amount: Number(affiliateCredits.amount) + rewardAmount,
        });
    } else {
        // Create new credits with the invoice's currency code
        await user.relation<Credit>('credits').create({
            amount: rewardAmount,
            currency_code: invoice.currency_code,
        });
    }
}
