import { Product } from '@/server/models/Product';
import { Plan } from '@/server/models/Plan';
import { Currency } from '@/server/models/Currency';
import { Server } from '@/server/models/Server';
import { Setting } from '@/server/models/Setting';
import { ExtensionHelper } from '@/server/extensions/helper';
import { cacheForget } from '@/server/cache';
import { setting } from '@/server/config';
import { slug } from '@/server/lib/php';
import type { Model } from '@/server/orm';
import { Resource } from '../core/Resource';
import { Schema, Checkbox, FileUpload, Grid, RichEditor, Select, Tab, Tabs, Textarea, TextInput, Repeater } from '../forms';
import { convertInput } from '../forms/convert';
import { TextEntry } from '../infolists';
import { Table } from '../tables/Table';
import { SelectFilter } from '../tables/filters';
import { TextColumn } from '../tables/columns/TextColumn';
import { Action } from '../actions/Action';
import { CreateAction, DeleteAction, EditAction } from '../actions/builtin';
import { AuditAction } from '../actions/AuditAction';
import { Notification } from '../Notification';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { CategoryResource } from './CategoryResource';

/** `ProductResource::plan()`: the pricing repeater (also used by the config options) */
export function plan() {
    return Repeater.make('plan')
        .addActionLabel('Add new plan')
        .relationship('plans')
        .name('name')
        .reorderable()
        .cloneable()
        .collapsible()
        .collapsed()
        .orderColumn()
        .defaultItems(1)
        .minItems(1)
        .columns(2)
        .deleteAction((action) => {
            action.before(async ({ record, state, arguments: args }) => {
                if (!record) return;
                const key = args?.item as string;
                if (!state?.[key]?.id) return;
                const found = await (record as any).relation('plans').find(state[key].id);
                if (found && (await found.relation('services').count()) > 0) {
                    await Notification.make().title('Whoops!').body('You cannot delete this plan because it is being used by one or more services.').danger().send();
                    action.cancel();
                }
            });
        })
        .itemLabel(({ state }) => state.name ?? null)
        .schema([
            TextInput.make('name').required().live(true).maxLength(255),
            Select.make('type')
                .options({ free: 'Free', 'one-time': 'One Time', recurring: 'Recurring' })
                .required()
                .live(false, 300)
                .afterStateUpdated(({ set, state }) => {
                    if (state === 'free') {
                        set('every', null);
                        set('price', 0);
                    }
                })
                .placeholder('Select the type of the price')
                .default('free'),

            TextInput.make('billing_period')
                .required()
                .label('Time Interval')
                .default(1)
                .hidden(({ get }) => get('type') !== 'recurring'),

            Select.make('billing_unit')
                .options({ day: 'Day', week: 'Week', month: 'Month', year: 'Year' })
                .label('Billing period')
                .required()
                .default('month')
                .hidden(({ get }) => get('type') !== 'recurring'),
            Repeater.make('pricing')
                .hidden(({ get }) => get('type') === 'free')
                .columns(3)
                .addActionLabel('Add new price')
                .reorderable(false)
                .relationship('prices')
                .columnSpanFull()
                .maxItems(() => Currency.query().count())
                .defaultItems(1)
                .itemLabel(({ state }) => state.currency_code ?? null)
                .schema([
                    Select.make('currency_code')
                        .options(async ({ get, state }) => {
                            const used = Object.values((get('../../pricing') ?? {}) as Record<string, any>)
                                .map((item) => item?.currency_code)
                                .filter((code) => code !== null && code !== undefined && code !== state);
                            const codes = (await Currency.query().get()).map((c: any) => c.code as string).filter((code) => !used.includes(code));
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
                        .hidden(({ get }) => get('type') === 'free'),
                    TextInput.make('setup_fee')
                        .label('Setup fee')
                        .live(true)
                        .moneyMask()
                        .numeric()
                        .minValue(0)
                        .hidden(({ get }) => get('type') === 'free'),
                ]),
        ]);
}

export class ProductResource extends Resource {
    static model = Product;
    static slug = 'products';
    static navigationGroup = 'Administration';
    static navigationIcon = 'ri-instance-line';
    static activeNavigationIcon = 'ri-instance-fill';
    static recordTitleAttribute = 'name';

    static override form(schema: Schema) {
        return schema
            .components([
                Tabs.make('Tabs')
                    .persistTabInQueryString()
                    .tabs([
                        Tab.make('General')
                            .columns(2)
                            .schema([
                                TextInput.make('name')
                                    .required()
                                    .maxLength(255)
                                    .live(true)
                                    .afterStateUpdated(({ get, set, old, state }) => {
                                        if ((get('slug') ?? '') !== slug(old ?? '')) return;
                                        set('slug', slug(state ?? ''));
                                    }),
                                TextInput.make('slug').required().unique(this.model, 'slug', null, true),
                                TextInput.make('stock').integer().nullable(),
                                TextInput.make('per_user_limit').integer().nullable(),
                                Select.make('allow_quantity').options({ disabled: 'No', separated: 'Separated', combined: 'Combined' }).default('separated').required(),
                                Textarea.make('email_template').hint('This snippet will be used in the email template.').nullable(),
                                Checkbox.make('hidden').label('Hide product').hint('Hide the product from the client area.'),

                                RichEditor.make('description').nullable().columnSpanFull(),
                                FileUpload.make('image').label('Image').nullable().visibility('public').imageEditor().image().disk('public').acceptedFileTypes(['image/*']),
                                Select.make('category_id')
                                    .relationship('category', 'name')
                                    .searchable()
                                    .preload()
                                    .createOptionForm((schema) => CategoryResource.form(schema))
                                    .required(),
                            ]),
                        Tab.make('Pricing').schema([plan()]),

                        Tab.make('Upgrades').schema([
                            // Select input for the products this product can upgrade to (hasmany relationship)
                            Select.make('upgrades').label('Upgrades').relationship('upgrades', 'name', undefined, true).multiple().preload().placeholder('Select the products that this product can upgrade to'),
                        ]),

                        Tab.make('Server').schema([
                            Select.make('server_id')
                                .relationship('server', 'name')
                                .searchable()
                                .preload()
                                .hintAction(
                                    Action.make('refresh')
                                        .label('Refresh')
                                        .action(() => cacheForget('product_config'))
                                        .hidden(({ get }) => get('server_id') === null || get('server_id') === undefined),
                                )
                                .live()
                                .afterStateUpdated(({ set }) => set('settings', {})),

                            Grid.make()
                                .hidden(({ get }) => get('server_id') === null || get('server_id') === undefined)
                                .columns(2)
                                .key('extension_settings')
                                .schema(async ({ get }) => {
                                    const server = get('server_id');
                                    if (server === null || server === undefined) return [];
                                    const settings: any[] = [];

                                    try {
                                        const found = await Server.query().find(server);
                                        if (!found) throw new Error(`No query results for model [App\\Models\\Server] ${server}`);
                                        for (const config of await ExtensionHelper.getProductConfigOnce(found, get('settings'))) {
                                            // Easier to use dot notation for settings
                                            settings.push(convertInput({ ...config, name: `settings.${config.name}` }));
                                        }
                                    } catch (e: any) {
                                        settings.push(TextEntry.make('error').state(String(e?.message ?? e)));
                                    }

                                    return settings;
                                }),
                        ]),
                    ]),
            ])
            .columns(1);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('name').searchable(true, ({ query, search }) => {
                    query.where('products.name', 'like', `%${search}%`);
                }),
                TextColumn.make('slug'),
                TextColumn.make('category.name').searchable(),
            ])
            .filters([SelectFilter.make('category').relationship('category', 'name').searchable().preload()])
            .recordActions([EditAction.make()])
            .defaultSort((q) => q.orderBy('sort', 'asc'))
            .defaultGroup('category.name');
    }

    static override getPages() {
        return { index: ListProducts.route('/'), create: CreateProduct.route('/create'), edit: EditProduct.route('/{record}/edit') };
    }
}

/** `$record->settings()->upsert(...)` of the product pages: the server settings of a product */
async function saveProductSettings(record: any, data: Record<string, any>) {
    const config = await ExtensionHelper.getProductConfig(await Server.query().findOrFail(data.server_id), data.settings);
    const rows = config.map((option: any) => ({
        key: option.name,
        settingable_id: record.id,
        settingable_type: record.ctor.morphName,
        type: option.database_type ?? 'string',
        value: data.settings[option.name] !== undefined && data.settings[option.name] !== null ? (Array.isArray(data.settings[option.name]) || typeof data.settings[option.name] === 'object' ? JSON.stringify(data.settings[option.name]) : data.settings[option.name]) : null,
    }));
    await Setting.query().upsert(rows, ['key', 'settingable_id', 'settingable_type'], ['type', 'value']);
}

const without = (data: Record<string, any>, keys: string[]) => Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));

class CreateProduct extends CreateRecord {
    static override resource = ProductResource;

    protected override async handleRecordCreation(data: Record<string, any>) {
        const record = await Product.create(without(data, ['settings']));
        if (data.settings === undefined || data.settings === null) return record;
        await saveProductSettings(record, data);
        return record;
    }
}

class EditProduct extends EditRecord {
    static override resource = ProductResource;

    override getHeaderActions() {
        return [
            Action.make('duplicate')
                .label('Duplicate')
                .requiresConfirmation()
                .action(async ({ record }) => {
                    const source = record as any;
                    const copy = source.replicate();
                    copy.name = `Copy of ${source.name}`;
                    copy.slug = slug(copy.name);
                    await copy.save();

                    // Duplicate settings
                    for (const s of await source.relation('settings').get()) {
                        const newSetting = s.replicate();
                        newSetting.settingable_id = copy.id;
                        await newSetting.save();
                    }

                    // Duplicate the upgrade relationship (its a belongsToMany, so we need to use the pivot table)
                    for (const upgrade of await source.relation('upgrades').get()) await copy.relation('upgrades').attach(upgrade.id);

                    // Duplicate plans and their prices
                    for (const p of await source.relation('plans').get()) {
                        const newPlan = p.replicate();
                        newPlan.priceable_id = copy.id;
                        await newPlan.save();

                        // Duplicate plan prices
                        for (const price of await p.relation('prices').get()) {
                            const newPrice = price.replicate();
                            newPrice.plan_id = newPlan.id;
                            await newPrice.save();
                        }
                    }

                    await Notification.make().title('Product duplicated successfully!').success().send();
                    return copy;
                })
                .successRedirectUrl(({ result }) => ProductResource.getUrl('edit', { record: result })),
            DeleteAction.make()
                .before(async ({ record, action }) => {
                    if ((await (record as any).relation('services').count()) > 0) {
                        await Notification.make().title('Whoops!').body('You cannot delete this plan because it is being used by one or more services.').danger().send();
                        action.cancel();
                    }
                })
                .after(async ({ record }) => {
                    await (record as any).relation('settings').delete();
                }),
            AuditAction.make(),
        ];
    }

    protected override async mutateFormDataBeforeFill(data: Record<string, any>) {
        for (const s of await (this.record as any).rel('settings')) (data.settings ??= {})[s.key] = s.value;
        return data;
    }

    protected override async handleRecordUpdate(record: Model<any>, data: Record<string, any>) {
        await record.update(without(data, ['settings']));
        if (data.settings === undefined || data.settings === null) return record;
        await saveProductSettings(record, data);
        return record;
    }
}

class ListProducts extends ListRecords {
    static override resource = ProductResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
