import { CustomProperty } from '@/server/models/CustomProperty';
import { hasPermission } from '@/server/policies';
import { Resource } from '../core/Resource';
import { Schema, Section, Select, TagsInput, Textarea, TextInput, Toggle } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { ToggleColumn } from '../tables/columns/ToggleColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { titleCase } from '../core/Resource';

/** `mb_strimwidth($value, 0, $width, '...')` */
const strimwidth = (value: string, width: number, trim = '...') => (value.length <= width ? value : value.slice(0, width - trim.length) + trim);

export class CustomPropertyResource extends Resource {
    static model = CustomProperty;
    static slug = 'custom-properties';
    static navigationGroup = 'Configuration';
    static navigationIcon = 'ri-list-settings-line';
    static activeNavigationIcon = 'ri-list-settings-fill';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('name').required().maxLength(255),
            TextInput.make('key').required(),
            Select.make('model').options({ 'App\\Models\\User': 'User' }).required(),
            Select.make('type')
                .options({ string: 'Short Text', text: 'Long Text', number: 'Number', select: 'Select', checkbox: 'Checkbox', radio: 'Radio', date: 'Date' })
                .required()
                .live(),
            Textarea.make('description').nullable().columnSpanFull().rows(2),
            TagsInput.make('allowed_values')
                .visible(({ get }) => ['select', 'radio'].includes(get('type')))
                .nullable(),
            TextInput.make('validation').nullable(),
            Section.make()
                .columns({ sm: 1, md: 3 })
                .schema([Toggle.make('non_editable').default(false), Toggle.make('required').default(false), Toggle.make('show_on_invoice').default(false)]),
        ]);
    }

    static override table(table: Table) {
        const denied = async ({ user }: { user?: any }) => !(await hasPermission(user, 'admin.custom_properties.update'));
        return table
            .columns([
                TextColumn.make('name')
                    .label('Property')
                    .description(({ record }) => strimwidth(record.description ?? '', 75)),
                TextColumn.make('key'),
                TextColumn.make('type').formatStateUsing(({ state }) => titleCase(String(state ?? ''))),
                ToggleColumn.make('non_editable').disabled(denied),
                ToggleColumn.make('required').disabled(denied),
                ToggleColumn.make('show_on_invoice').disabled(denied),
            ])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])])
            .defaultGroup('model');
    }

    static override getPages() {
        return {
            index: ListCustomProperty.route('/'),
            create: CreateCustomProperty.route('/create'),
            edit: EditCustomProperty.route('/{record}/edit'),
        };
    }
}

class CreateCustomProperty extends CreateRecord {
    static override resource = CustomPropertyResource;
}

class EditCustomProperty extends EditRecord {
    static override resource = CustomPropertyResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}

class ListCustomProperty extends ListRecords {
    static override resource = CustomPropertyResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
