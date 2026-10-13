import { Order } from '@/server/models/Order';
import { Product } from '@/server/models/Product';
import { Currency } from '@/server/models/Currency';
import { Invoice } from '@/server/models/Invoice';
import { setting } from '@/server/config';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Carbon } from '@/server/lib/carbon';
import { Resource } from '../core/Resource';
import { Schema, Hidden, Repeater, Select, TextInput } from '../forms';
import { UserComponent } from '../components/UserComponent';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { Action, BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction, ViewAction } from '../actions/builtin';
import { Notification } from '../Notification';
import { dbValue } from '../core/attributes';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { RelationManager } from './RelationManager';
import { ServiceResource } from './ServiceResource';

class ServiceRelationManager extends RelationManager {
    static override relationship = 'services';

    override table(table: Table) {
        return table
            .recordTitleAttribute('product.name')
            .columns([TextColumn.make('product.name'), TextColumn.make('quantity'), TextColumn.make('formattedPrice').label('Price')])
            .filters([])
            .recordActions([ViewAction.make().url(({ record }) => ServiceResource.getUrl('edit', { record }))])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }
}

/** the services of the repeater with a value set on each (`collect($get('services'))->map(...)`) */
const withEach = (services: Record<string, any> | null | undefined, values: Record<string, any>) => Object.fromEntries(Object.entries(services ?? {}).map(([key, service]) => [key, { ...service, ...values }]));

export class OrderResource extends Resource {
    static model = Order;
    static slug = 'orders';
    static navigationIcon = 'ri-shopping-bag-4-line';
    static activeNavigationIcon = 'ri-shopping-bag-4-fill';
    static navigationGroup = 'Administration';

    static override form(schema: Schema) {
        return schema.components([
            UserComponent.make('user_id').afterStateUpdated(({ set, get }) => {
                // update all the services user_id
                set('services', withEach(get('services'), { user_id: get('user_id') }));
            }),
            Select.make('currency_code')
                .label('Currency')
                .required()
                .live()
                .afterStateUpdated(({ set, get }) => {
                    // update all the services currency_code
                    set('services', withEach(get('services'), { currency_code: get('currency_code') }));
                })
                .options(async () => Object.fromEntries(((await Currency.query().get()) as any[]).map((c) => [c.code, c.code])))
                .helperText('Does not convert the price, only displays the currency symbol')
                .placeholder('Select the currency'),
            Repeater.make('services')
                .relationship('services')
                .label('Services')
                .columnSpanFull()
                .columns(2)
                .schema([
                    Hidden.make('user_id').default(({ get }: any) => get('../../user_id')),
                    Hidden.make('currency_code').default(({ get }: any) => get('../../currency_code')),
                    Select.make('product_id')
                        .label('Product')
                        .required()
                        .relationship('product', 'name', (q) => void q.with('category'))
                        .getOptionLabelFromRecordUsing(async (product: any) => `${product.name} - ${(await product.rel('category')).name} (#${product.id})`)
                        .searchable()
                        .preload()
                        .live()
                        .afterStateUpdated(({ set }) => set('plan_id', null))
                        .placeholder('Select the product'),
                    Select.make('plan_id')
                        .label('Plan')
                        .required()
                        .relationship('plan', 'name', (q, _search, { get }) => void q.where('priceable_type', 'App\\Models\\Product').where('priceable_id', get('product_id')))
                        .searchable()
                        .preload()
                        .live()
                        .disabled(({ get }) => !get('product_id') || !get('../../currency_code'))
                        .afterStateUpdated(async ({ set, get }) => {
                            if (!get('product_id') || !get('plan_id') || !get('../../currency_code')) return;
                            // Update the price when the plan changes
                            const product = await Product.find(get('product_id'));
                            const plan = ((await (product as any).rel('plans')) as any[]).find((p) => String(p.id) === String(get('plan_id')));
                            const price = plan ? ((await plan.rel('prices')) as any[]).find((p) => p.currency_code === get('../../currency_code')) : null;
                            if (!price) return;
                            set('price', dbValue(price, 'price', price.price));
                        })
                        .placeholder('Select the plan'),
                    TextInput.make('quantity').label('Quantity').required().placeholder('Enter the quantity'),
                    TextInput.make('price')
                        .suffix(async ({ record, get }) => ((await record?.rel('currency')) ?? (await Currency.query().where('code', get('../../currency_code')).first()))?.suffix ?? null)
                        .prefix(async ({ record, get }) => ((await record?.rel('currency')) ?? (await Currency.query().where('code', get('../../currency_code')).first()))?.prefix ?? null)
                        .label('Price')
                        .required()
                        .moneyMask()
                        .placeholder('Enter the price'),
                    TextInput.make('subscription_id')
                        .label('Subscription ID')
                        .nullable()
                        .placeholder('Enter the subscription ID')
                        .hintActions([
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
                        ]),
                ]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('id').label('ID').searchable().sortable(),
                TextColumn.make('user.name')
                    .label('User')
                    .searchable(true, ({ query, search }) => {
                        query.whereHas('user', (q) => void q.where('first_name', 'like', `%${search}%`).orWhere('last_name', 'like', `%${search}%`));
                    }),
                TextColumn.make('currency.code').label('Currency').searchable().sortable(),
                TextColumn.make('formattedTotal').label('Total'),
                TextColumn.make('updated_at').label('Updated At').searchable().sortable(),
            ])
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getRelations() {
        return [ServiceRelationManager];
    }

    static override getPages() {
        return { index: ListOrders.route('/'), create: CreateOrder.route('/create'), edit: EditOrder.route('/{record}/edit') };
    }
}

class CreateOrder extends CreateRecord {
    static override resource = OrderResource;

    protected override async afterCreate() {
        const order = this.record as any;
        const invoice = new Invoice();
        invoice.fill({ user_id: order.user_id, currency_code: order.currency_code, due_at: Carbon.now().addUnit('day', 7), status: setting('immutable_invoices_enabled', false) ? Invoice.STATUS_DRAFT : Invoice.STATUS_PENDING });
        await invoice.save();

        for (const service of (await order.relation('services').get()) as any[]) {
            await invoice.relation('items').create({
                description: await service.description(),
                price: service.price,
                quantity: service.quantity,
                reference_id: service.id,
                reference_type: service.ctor.morphName,
            });
        }
    }
}

class EditOrder extends EditRecord {
    static override resource = OrderResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}

class ListOrders extends ListRecords {
    static override resource = OrderResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
