import { CustomProperty } from '@/server/models/CustomProperty';
import { RelationManager } from './RelationManager';
import { Schema, Select, TextInput } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { TextInputColumn } from '../tables/columns/ToggleColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';

/** App\Admin\Resources\Common\RelationManagers\PropertiesRelationManager: the custom properties of a record */
export class PropertiesRelationManager extends RelationManager {
    static override relationship = 'properties';

    override form(schema: Schema) {
        return schema.components([
            Select.make('custom_property_id')
                .label('Custom Property')
                .required()
                .options(async ({ ownerRecord }) => {
                    const properties = await CustomProperty.query().where('model', (ownerRecord as any).ctor.morphName).get();
                    return Object.fromEntries(properties.map((p: any) => [String(p.id), p.name]));
                })
                .nullable(),
            TextInput.make('name').translateLabel().nullable(),
            TextInput.make('key').translateLabel().required(),
            TextInput.make('value').translateLabel().required(),
        ]);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('name')
            .columns([TextColumn.make('name'), TextColumn.make('parent_property.name'), TextColumn.make('key'), TextInputColumn.make('value')])
            .filters([])
            .headerActions([CreateAction.make()])
            .recordActions([EditAction.make(), DeleteAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }
}
