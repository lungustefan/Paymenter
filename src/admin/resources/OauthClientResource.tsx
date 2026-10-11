import { OauthClient } from '@/server/models/OauthClient';
import { createAuthorizationCodeGrantClient, ensureOauthKeys, regenerateClientSecret } from '@/server/oauth/clients';
import { markdown } from '@/server/markdown';
import { Resource } from '../core/Resource';
import { Schema, TagsInput, TextInput } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { Action, BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { Notification } from '../Notification';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';

/** App\Admin\Resources\OauthClientResource */
export class OauthClientResource extends Resource {
    static model = OauthClient;
    static slug = 'oauth-clients';
    static modelLabel = 'OAuth Client';
    static navigationIcon = 'ri-lock-2-line';
    static activeNavigationIcon = 'ri-lock-2-fill';
    static navigationGroup = 'Other';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('name').required().maxLength(255),
            TagsInput.make('redirect').required().separator(',').columnSpanFull(),
            TextInput.make('secret')
                .disabled()
                .formatStateUsing(() => '********')
                .hiddenOn(['create'])
                .suffixAction(
                    Action.make('regenerate')
                        .icon('heroicon-s-arrow-path')
                        .requiresConfirmation()
                        .modalDescription('Are you sure you want to regenerate the client secret? This will invalidate the current client secret and you will need to update any applications using this client with the new secret.')
                        .action(async ({ record }: any) => {
                            const secret = await regenerateClientSecret(record);
                            await Notification.make()
                                .title('OAuth Client Secret Regenerated')
                                .body(markdown(`Here is the client secret for the OAuth client you just regenerated. It will not be shown again. \n\n Secret: \`\`\`${secret}\`\`\``))
                                .icon('heroicon-o-lock-closed')
                                .persistent()
                                .success()
                                .send();
                        }),
                ),
            TextInput.make('client_id')
                .disabled()
                .formatStateUsing(({ record }: any) => record?.id)
                .hiddenOn(['create']),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('id').label('ID'), TextColumn.make('name').searchable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListOauthClients.route('/'), create: CreateOauthClient.route('/create'), edit: EditOauthClient.route('/{record}/edit') };
    }
}

class CreateOauthClient extends CreateRecord {
    static override resource = OauthClientResource;

    protected override async handleRecordCreation(data: Record<string, any>) {
        await ensureOauthKeys();
        const redirects = Array.isArray(data.redirect) ? data.redirect : String(data.redirect).split(',');
        const { client, plainSecret } = await createAuthorizationCodeGrantClient(data.name, redirects);
        await Notification.make()
            .title('OAuth Client Created')
            .body(markdown(`Here is the client secret for the OAuth client you just created. Please copy it now, as it will not be shown again.\n\n Client Secret:\n \`\`\`${plainSecret}\`\`\``))
            .icon('heroicon-o-lock-closed')
            .persistent()
            .success()
            .send();
        return client;
    }
}
class EditOauthClient extends EditRecord {
    static override resource = OauthClientResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListOauthClients extends ListRecords {
    static override resource = OauthClientResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
