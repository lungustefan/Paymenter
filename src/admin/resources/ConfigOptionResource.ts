import { ConfigOption } from '@/server/models/ConfigOption';
import { Resource } from '../core/Resource';
import { Schema, Checkbox, Select, Tab, Tabs, TextInput, Repeater } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { CreateAction, DeleteAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { plan } from './ProductResource';

export class ConfigOptionResource extends Resource {
    static model = ConfigOption;
    static slug = 'config-options';
    static navigationGroup = 'Configuration';
    static navigationIcon = 'ri-equalizer-2-line';
    static activeNavigationIcon = 'ri-equalizer-2-fill';

    static override form(schema: Schema) {
        return schema.components([
            Tabs.make()
                .columnSpanFull()
                .schema([
                    Tab.make('General').schema([
                        TextInput.make('name').label('Name').required().maxLength(255).placeholder('Enter the name of the configuration option'),
                        TextInput.make('description').label('Description').columnSpanFull().maxLength(255).placeholder('Enter the description of the configuration option'),
                        TextInput.make('env_variable').label('Environment Variable').maxLength(255).placeholder('Enter the environment variable name'),
                        Select.make('type')
                            .label('Type')
                            .native(false)
                            .required()
                            .reactive()
                            .options({ text: 'Text', number: 'Number', select: 'Select', radio: 'Radio', checkbox: 'Checkbox', slider: 'Slider' }),
                        Checkbox.make('hidden').label('Hidden'),
                        Checkbox.make('upgradable')
                            .visible(({ get }) => ['select', 'radio', 'slider'].includes(get('type')))
                            .label('Upgradable')
                            .helperText('If enabled, this configuration option can be upgraded in the future.'),
                        Select.make('products').label('Products').relationship('products', 'name').multiple().preload().placeholder('Select the products that this configuration option belongs to'),
                    ]),
                    Tab.make('Options')
                        .visible(({ get }) => ['select', 'radio', 'slider', 'checkbox'].includes(get('type')))
                        .schema([
                            Repeater.make('Options')
                                .relationship('children')
                                .label('Options')
                                .addActionLabel('Add Option')
                                .columnSpanFull()
                                .itemLabel(({ state }) => state.name ?? null)
                                .collapsible()
                                .collapsed()
                                .cloneable()
                                .reorderable()
                                .orderColumn('sort')
                                .columns(2)
                                // When the type is checkbox only allow 1 child
                                .maxItems(({ get }) => (['select', 'radio', 'slider'].includes(get('type')) ? null : 1))
                                .minItems(1)
                                .schema([
                                    TextInput.make('name').label('Name').required().live().maxLength(255).placeholder('Enter the name of the configuration option'),
                                    TextInput.make('env_variable').label('Environment Variable').required().maxLength(255).placeholder('Enter the environment variable name'),
                                    // if the type is select, radio or checkbox then allow unlimited children (otherwise only allow 1)
                                    plan().columnSpanFull().label('Pricing').reorderable(false).deleteAction(null),
                                ]),
                        ]),
                ]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('name').label('Name').searchable().sortable(),
                TextColumn.make('env_variable').label('Environment Variable').searchable().sortable(),
                TextColumn.make('type').label('Type').searchable().sortable(),
                TextColumn.make('hidden').badge().label('Hidden').sortable(),
            ])
            .modifyQueryUsing((q) => q.where('parent_id', null))
            .filters([])
            .recordActions([EditAction.make()])
            .defaultSort((q) => q.orderBy('sort', 'asc'))
            .reorderable('sort');
    }

    static override getRelations() {
        return [];
    }

    static override getPages() {
        return { index: ListConfigOptions.route('/'), create: CreateConfigOption.route('/create'), edit: EditConfigOption.route('/{record}/edit') };
    }
}

class CreateConfigOption extends CreateRecord {
    static override resource = ConfigOptionResource;
}

class EditConfigOption extends EditRecord {
    static override resource = ConfigOptionResource;

    override getHeaderActions() {
        return [
            // Show warning when there are child config options
            DeleteAction.make('Delete')
                .requiresConfirmation()
                .modalDescription(async ({ record }) =>
                    (await (record as any).relation('serviceConfigs').exists())
                        ? 'This config option has services connected to it. Deleting it will also delete it from the services it is associated with. Are you sure you want to delete this config option?'
                        : 'Are you sure you want to delete this config option?',
                )
                .action(async () => {
                    await (this.record as any).relation('serviceConfigs').delete();
                    await this.record!.delete();
                })
                .successRedirectUrl(() => ConfigOptionResource.getUrl()),
        ];
    }
}

class ListConfigOptions extends ListRecords {
    static override resource = ConfigOptionResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
