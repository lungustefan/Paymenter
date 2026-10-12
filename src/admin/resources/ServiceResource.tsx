import { Service } from '@/server/models/Service';
import { ServiceCancellation } from '@/server/models/ServiceCancellation';
import { Invoice } from '@/server/models/Invoice';
import { sql } from 'drizzle-orm';
import { Currency } from '@/server/models/Currency';
import { ExtensionHelper } from '@/server/extensions/helper';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { Cluster, Resource } from '../core/Resource';
import { Schema, Checkbox, DatePicker, Select, TextInput } from '../forms';
import { UserComponent } from '../components/UserComponent';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { Filter, SelectFilter } from '../tables/filters';
import { Action, BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction, ViewAction } from '../actions/builtin';
import { AuditAction } from '../actions/AuditAction';
import { Notification } from '../Notification';
import { Icon } from '../ui/Icon';
import { Widget } from '../widgets/Widget';
import { adminContext } from '../context';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { RelationManager } from './RelationManager';
import { PropertiesRelationManager } from './PropertiesRelationManager';
import { InvoiceResource } from './InvoiceResource';

export class ServicesCluster extends Cluster {
    static slug = 'services';
    static navigationIcon = 'ri-archive-stack-line';
    static activeNavigationIcon = 'ri-archive-stack-fill';
    static navigationGroup = 'Administration';
    static navigationSort = 0;
}

const ucfirst = (s: unknown) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** `Service::getUrl('edit', ...)` of the service resource */
export const serviceEditUrl = (record: any) => ServiceResource.getUrl('edit', { record });

/* ---------------------------------------------------------------------------------------------
 * relation managers
 * ------------------------------------------------------------------------------------------- */

class ConfigOptionsRelationManager extends RelationManager {
    static override relationship = 'configs';

    override form(schema: Schema) {
        return schema.components([
            Select.make('configValue.id')
                .label('Config Value')
                .required()
                .relationship('configValue', 'id', (q, _search, { record }) => void q.where('parent_id', record.config_option_id))
                .searchable()
                .getOptionLabelFromRecordUsing((record: any) => record.name)
                .getSearchResultsUsing(async ({ search, record }) => {
                    const children = await (await record.rel('configOption')).relation('children').where('name', 'like', `%${search}%`).limit(50).get();
                    return Object.fromEntries(children.map((c: any) => [String(c.id), c.name]));
                })
                .live()
                .preload()
                .required(),
        ]);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('configOption.name')
            .columns([TextColumn.make('configOption.name'), TextColumn.make('configValue.name')])
            .filters([])
            .headerActions([])
            .recordActions([EditAction.make(), DeleteAction.make()]);
    }
}

class InvoicesRelationManager extends RelationManager {
    static override relationship = 'invoices';

    // Edit query
    override getTableQuery() {
        const id = (this.ownerRecord as any).id;
        const service = 'App\\Models\\Service';
        const upgrade = 'App\\Models\\ServiceUpgrade';
        return Invoice.query().whereRaw(
            sql`invoices.id in (select invoice_id from invoice_items where (reference_type = ${service} and reference_id = ${id}) or (reference_type = ${upgrade} and reference_id in (select id from service_upgrades where service_id = ${id})))`,
        );
    }

    override form(schema: Schema) {
        return schema.components([TextInput.make('id').required().maxLength(255)]);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('id')
            .columns([
                TextColumn.make('id').sortable(),
                TextColumn.make('formattedTotal').label('Total'),
                TextColumn.make('status')
                    .label('Status')
                    // Make first letter uppercase
                    .formatStateUsing(({ state }) => ucfirst(state))
                    .badge()
                    .color(({ state }) => ({ paid: 'success', pending: 'warning' })[state as string] ?? 'danger'),
            ])
            .filters([])
            .headerActions([])
            .recordActions([ViewAction.make().url(({ record }) => InvoiceResource.getUrl('edit', { record }))])
            .defaultSort('invoices.id', 'desc');
    }
}

/* ---------------------------------------------------------------------------------------------
 * the resource
 * ------------------------------------------------------------------------------------------- */

export class ServiceResource extends Resource {
    static model = Service;
    static slug = 'services';
    static cluster = ServicesCluster;
    static navigationIcon = 'ri-function-line';
    static activeNavigationIcon = 'ri-function-fill';

    static override async getNavigationBadge() {
        const count = await Service.query().where('status', 'pending').count();
        return count ? String(count) : null;
    }

    static override getNavigationBadgeColor() {
        return 'warning';
    }

    static override form(schema: Schema) {
        return schema.components([
            Select.make('product_id')
                .label('Product')
                .required()
                .relationship('product', 'name', (q) => void q.with('category'))
                .getOptionLabelFromRecordUsing(async (product: any) => `${product.name} - ${(await product.rel('category')).name} (#${product.id})`)
                .searchable()
                .live()
                .preload()
                .placeholder('Select the product'),
            Select.make('plan_id')
                .label('Plan')
                .required()
                .relationship('plan', 'name', (q, _search, { get }) => void q.where('priceable_id', get('product_id')).where('priceable_type', 'App\\Models\\Product'))
                .searchable()
                .preload()
                .disabled(({ get }) => !get('product_id'))
                .placeholder('Select the plan'),
            UserComponent.make('user_id'),
            Select.make('status')
                .label('Status')
                .required()
                .options({
                    // active, pending, suspended, cancelled
                    active: 'Active',
                    pending: 'Pending',
                    suspended: 'Suspended',
                    cancelled: 'Cancelled',
                })
                .default('pending'),
            TextInput.make('quantity').label('Quantity').required().placeholder('Enter the quantity'),
            DatePicker.make('expires_at')
                .label('Expires At')
                .required(({ get }) => get('plan')?.type != 'one-time' && get('plan')?.type != 'free' && get('status') !== 'pending')
                .placeholder('Select the expiration date'),
            Select.make('coupon_id').label('Coupon').relationship('coupon', 'code').searchable().preload().placeholder('Select the coupon'),
            Select.make('currency_code')
                .options(async ({ get, state }) => {
                    const used = Object.values((get('../../pricing') ?? {}) as Record<string, any>)
                        .map((item) => item?.currency_code)
                        .filter((code) => code !== null && code !== undefined && code !== state);
                    const codes = ((await Currency.query().get()) as any[]).map((c) => c.code as string).filter((code) => !used.includes(code));
                    return Object.fromEntries(codes.map((code) => [code, code]));
                })
                .live()
                .default(() => setting('default_currency'))
                .required(),
            TextInput.make('price')
                .required()
                .label('Price')
                // Suffix based on chosen currency
                .prefix(async ({ get }) => ((await Currency.query().where('code', get('currency_code')).first()) as any)?.prefix ?? null)
                .suffix(async ({ get }) => ((await Currency.query().where('code', get('currency_code')).first()) as any)?.suffix ?? null)
                .live(true)
                .moneyMask()
                .numeric()
                .minValue(0)
                .hintAction(
                    Action.make('Recalculate Price')
                        .action(async ({ record, set, statePath }) => {
                            if (record) {
                                await Notification.make().title('The price has been successfully recalculated').success().send();
                                // Update the form field
                                set(statePath, await (record as any).calculatePrice(), true);
                            }
                        })
                        .label('Recalculate Price')
                        .icon('ri-refresh-line'),
                ),
            Select.make('billing_agreement_id')
                .label('Billing Agreement')
                .relationship('billingAgreement', 'name', (q, _search, { get }) => void q.where('user_id', get('user_id')))
                .searchable()
                .preload()
                .placeholder('Select the billing agreement'),
            TextInput.make('subscription_id')
                .label('Subscription ID (deprecated)')
                .nullable()
                .placeholder('Enter the subscription ID')
                .hintAction(
                    Action.make('Cancel Subscription ID')
                        .action(async ({ record }) => {
                            if (await ExtensionHelper.cancelSubscription(record as any)) {
                                await Notification.make().title('The subscription has been successfully cancelled').success().send();
                            } else {
                                await Notification.make().title('The subscription could not be cancelled').danger().send();
                            }
                            // Update the record to remove the subscription ID
                            await (record as any).update({ subscription_id: null });
                        })
                        .requiresConfirmation()
                        .label('Cancel Subscription')
                        .hidden(({ record }) => !record?.subscription_id),
                ),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('id').label('ID').sortable().searchable(),
                TextColumn.make('user.name')
                    .label('User')
                    .searchable(true, ({ query, search }) => {
                        query.whereHas('user', (q) => void q.where('first_name', 'like', `%${search}%`).orWhere('last_name', 'like', `%${search}%`));
                    }),
                TextColumn.make('product.name').label('Product').searchable().sortable(),
                TextColumn.make('status')
                    .badge()
                    .color(({ record }) => ({ pending: 'gray', active: 'success', cancelled: 'danger', suspended: 'warning' })[(record as Service).status as string] ?? null)
                    .formatStateUsing(({ state }) => ucfirst(state))
                    .label('Status')
                    .searchable()
                    .sortable(),
                TextColumn.make('expires_at').label('Expires At').date().searchable().sortable(),
            ])
            .filters([
                SelectFilter.make('status').label('Status').options({ active: 'Active', pending: 'Pending', suspended: 'Suspended', cancelled: 'Cancelled' }),
                SelectFilter.make('user')
                    .label('User')
                    .relationship('user', 'id')
                    .getOptionLabelFromRecordUsing((record: any) => `${record.displayName()} (${record.email})`)
                    .searchable()
                    .preload(),
                SelectFilter.make('product').label('Product').relationship('product', 'name').searchable().preload(),
                Filter.make('expires_at')
                    .form([DatePicker.make('expires_from').label('Expires From'), DatePicker.make('expires_until').label('Expires Until')])
                    .query(({ query, data }) => {
                        if (data.expires_from) query!.whereDate('expires_at', '>=', data.expires_from);
                        if (data.expires_until) query!.whereDate('expires_at', '<=', data.expires_until);
                    }),
            ])
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getRelations() {
        return [InvoicesRelationManager, PropertiesRelationManager, ConfigOptionsRelationManager];
    }

    static override getPages() {
        return { index: ListService.route('/'), create: CreateService.route('/create'), edit: EditService.route('/{record}/edit') };
    }
}

/** `admin.resources.service-resource.widgets.cancellation-overview` */
class CancellationOverview extends Widget {
    static override isLazy = false;
    static override columnSpan = 'full' as const;

    override async render() {
        const record = this.record as Service;
        const cancellation = (await record.rel('cancellation')) as ServiceCancellation;
        const expires = record.expires_at ? Carbon.parse(record.expires_at as any).translatedFormat('M j, Y', adminContext().locale) : null;
        return (
            <div className="fi-widget-wrapper rounded-lg shadow col-span-full p-4 flex justify-between items-center">
                <div className="flex  gap-2 items-center">
                    <Icon icon="ri-error-warning-line" size={null} className="size-5 text-yellow-500" />
                    {record.status === 'cancelled' ? (
                        <p className="text-sm text-gray-950 dark:text-white">
                            This service is cancelled. Reason: <span className="font-medium">{cancellation.reason}</span>
                        </p>
                    ) : (
                        <p className="text-sm text-gray-950 dark:text-white">
                            This service is pending cancellation{expires ? ` on ${expires}` : ''}. Reason: <span className="font-medium">{cancellation.reason}</span>
                        </p>
                    )}
                </div>
                <a href={ServiceCancellationResource.getUrl('edit', { record: cancellation })} className="fi-color fi-color-primary fi-text-color-600 dark:fi-text-color-300 fi-link fi-size-sm">
                    View Cancellation
                </a>
            </div>
        );
    }
}

class CreateService extends CreateRecord {
    static override resource = ServiceResource;
}

class EditService extends EditRecord {
    static override resource = ServiceResource;

    override getHeaderActions() {
        return [
            DeleteAction.make()
                .form(({ record }) => {
                    const r = record as any;
                    const status = !['pending', 'cancelled'].includes(r.status) && r.$relations?.product?.server_id !== null;
                    return status ? [Checkbox.make('deleteExtensionServer').label('Also trigger deletion of server').default(true)] : [];
                })
                .action(async ({ data, record }) => {
                    try {
                        if (data?.deleteExtensionServer) await ExtensionHelper.terminateServer(record as any);
                    } catch (e: any) {
                        console.error(e);
                        await Notification.make().title('Error occured while deleting the related server:').body(String(e?.message ?? e)).danger().send();
                    }
                    await record!.delete();
                }),
            Action.make('changeStatus')
                .label('Trigger Extension Action')
                .schema([
                    Select.make('action')
                        .label('Action')
                        .options({ create: 'Create server', suspend: 'Suspend server', unsuspend: 'Unsuspend server', terminate: 'Terminate server', upgrade: 'Upgrade server' })
                        .required(),
                    Checkbox.make('sendNotification').label('Send Notification').default(false),
                ])
                .action(async ({ data, record, action }) => {
                    const service = record as any;
                    try {
                        switch (data!.action) {
                            case 'create': {
                                const sdata = await ExtensionHelper.createServer(service);
                                if (data!.sendNotification) await NotificationHelper.serverCreatedNotification(await (await service.rel('order')).rel('user'), service, sdata);
                                break;
                            }
                            case 'suspend':
                                await ExtensionHelper.suspendServer(service);
                                break;
                            case 'unsuspend':
                                await ExtensionHelper.unsuspendServer(service);
                                break;
                            case 'terminate':
                                await ExtensionHelper.terminateServer(service);
                                break;
                            case 'upgrade':
                                await ExtensionHelper.upgradeServer(service);
                                break;
                        }
                    } catch (e: any) {
                        if (process.env.APP_DEBUG === 'true') throw e;
                        console.error(e);
                        await Notification.make().title('Error occured while triggering the action:').body(String(e?.message ?? e)).danger().send();
                        action.halt();
                    }
                    await Notification.make().title('Action triggered successfully').body('The action has been triggered successfully').success().send();
                })
                .color('primary')
                .modalSubmitActionLabel(() => 'Trigger'),

            AuditAction.make().auditChildren(['order', 'invoices', 'properties', 'configs', 'invoiceItems']),
        ];
    }

    override async getHeaderWidgets() {
        if (!(await (this.record as any).relation('cancellation').exists())) return [];
        return [CancellationOverview];
    }
}

class ListService extends ListRecords {
    static override resource = ServiceResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

/* ---------------------------------------------------------------------------------------------
 * cancellations
 * ------------------------------------------------------------------------------------------- */

export class ServiceCancellationResource extends Resource {
    static model = ServiceCancellation;
    static slug = 'service-cancellations';
    static cluster = ServicesCluster;
    static navigationIcon = 'heroicon-o-rectangle-stack';
    static navigationSort = 2;

    static override form(schema: Schema) {
        return schema.components([
            Select.make('service_id')
                .relationship('service', 'id', (q) => void q.where('status', 'active'))
                .getOptionLabelFromRecordUsing(async (record: any) => {
                    const user = await record.rel('user');
                    return `${(await record.rel('product')).name} - ${(await record.rel('plan')).name}  #${record.id}${user ? ` (${user.email})` : ''}`;
                })
                .searchable()
                .preload()
                .disabledOn('edit')
                .hint(({ get }) =>
                    get('service_id') ? (
                        <a href={ServiceResource.getUrl('edit', { record: get('service_id') })} target="_blank">
                            Go to Service
                        </a>
                    ) : null,
                )
                .required(),
            TextInput.make('reason').maxLength(255).default(null),
            Select.make('type').options({ end_of_period: 'End of Period', immediate: 'Immediate' }).disabledOn('edit').required(),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('service_id')
                    .formatStateUsing(async ({ record }) => {
                        const service = (await record.rel('service')) as any;
                        const user = await service?.rel('user');
                        return `${(await service.rel('product'))?.name} - ${(await service.rel('plan'))?.name}  #${service.id}${user ? ` (${user.email})` : ''}`;
                    })
                    .url(({ record }) => ServiceResource.getUrl('edit', { record: record.service_id }))
                    .sortable(),
                TextColumn.make('reason').searchable(),
                TextColumn.make('type'),
                TextColumn.make('created_at').dateTime().sortable().toggleable(true, true),
                TextColumn.make('updated_at').dateTime().sortable().toggleable(true, true),
            ])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])])
            .defaultSort('created_at', 'desc');
    }

    static override getRelations() {
        return [];
    }

    static override getPages() {
        return { index: ListServiceCancellations.route('/'), create: CreateServiceCancellation.route('/create'), edit: EditServiceCancellation.route('/{record}/edit') };
    }
}

class CreateServiceCancellation extends CreateRecord {
    static override resource = ServiceCancellationResource;
}
class EditServiceCancellation extends EditRecord {
    static override resource = ServiceCancellationResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListServiceCancellations extends ListRecords {
    static override resource = ServiceCancellationResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
