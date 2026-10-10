import { Role } from '@/server/models/Role';
import { Resource } from '../core/Resource';
import { Schema, TextInput, CheckboxList } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { CreateAction, DeleteAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { rolePermissions } from '../core/permissions';
import type { Model } from '@/server/orm';
import type { User } from '@/server/models/User';

export class RoleResource extends Resource {
    static model = Role;
    static slug = 'roles';
    static navigationGroup = 'Configuration';
    static navigationIcon = 'ri-shield-user-line';
    static activeNavigationIcon = 'ri-shield-user-fill';

    static override form(schema: Schema) {
        return schema
            .components([
                TextInput.make('name').unique(null, null, null, true).required().maxLength(255),
                // Split permission UI into core and extension
                CheckboxList.make('permissions')
                    .label(false)
                    .options(async () => rolePermissions())
                    .columns(4)
                    .bulkToggleable()
                    .searchable()
                    .noSearchResultsMessage('Permission could not be found')
                    .columnSpanFull(),
            ])
            .columns(1);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('name').sortable(),
                TextColumn.make('permissions_count')
                    .label('permissions')
                    .getStateUsing(({ record }) => (((record as any).permissions ?? []) as string[]).includes('*') ? 'All' : String(((record as any).permissions ?? []).length))
                    .sortable(),
            ])
            .filters([])
            .recordActions([EditAction.make()]);
    }

    static override async canEdit(user: User | null, record: Model<any>) {
        return (record as any).id !== 1 && (await super.canEdit(user, record));
    }

    static override getPages() {
        return {
            index: ListRoles.route('/'),
            create: CreateRole.route('/create'),
            edit: EditRole.route('/{record}/edit'),
        };
    }
}

class CreateRole extends CreateRecord {
    static override resource = RoleResource;
}

class EditRole extends EditRecord {
    static override resource = RoleResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}

class ListRoles extends ListRecords {
    static override resource = RoleResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
