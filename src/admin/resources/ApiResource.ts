import { randomBytes, createHash } from 'node:crypto';
import { ApiKey } from '@/server/models/ApiKey';
import { markdown } from '@/server/markdown';
import { Resource } from '../core/Resource';
import { Schema, TextInput, TagsInput, Toggle, CheckboxList } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { IconColumn } from '../tables/columns/IconColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { ManageRecords } from '../pages/resource/ManageRecords';
import { Notification } from '../Notification';
import { apiPermissions } from '../core/permissions';

export class ApiResource extends Resource {
    static model = ApiKey;
    static slug = 'apis';
    static navigationIcon = 'ri-key-2-line';
    static navigationGroup = 'Other';

    static override form(schema: Schema) {
        return schema
            .components([
                TextInput.make('name').required().maxLength(255).label('API Name'),
                TagsInput.make('ip_addresses').label('Allowed IP Addresses').placeholder('Enter IP addresses'),
                Toggle.make('enabled').default(true).visibleOn('edit').label('Active Status'),
                CheckboxList.make('permissions')
                    .options(async () => apiPermissions())
                    .columns(4)
                    .bulkToggleable()
                    .searchable()
                    .noSearchResultsMessage('Permission could not be found'),
            ])
            .columns(1);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('name'),
                TextColumn.make('ip_addresses')
                    .formatStateUsing(({ state }) => (Array.isArray(state) ? state.join(', ') : (state as string)))
                    .label('Allowed IP Addresses'),
                IconColumn.make('enabled').boolean(),
                TextColumn.make('last_used_at').dateTime().label('Last Used At').sortable().toggleable(),
            ])
            .filters([])
            .recordActions([EditAction.make(), DeleteAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ManageApis.route('/') };
    }
}

class ManageApis extends ManageRecords {
    static override resource = ApiResource;
    override getHeaderActions() {
        return [
            CreateAction.make().mutateDataUsing(async (data) => {
                const token = 'PAYM' + randomBytes(32).toString('hex');
                data.token = createHash('sha256').update(token).digest('hex');
                data.type = 'admin';
                await Notification.make()
                    .title('API Token Created')
                    .body(markdown(`Here is your new API token. Please copy it now, as it will not be shown again.\nToken: \`\`\`${token}\`\`\``))
                    .icon('heroicon-o-key')
                    .success()
                    .persistent()
                    .send();
                return data;
            }),
        ];
    }
}
