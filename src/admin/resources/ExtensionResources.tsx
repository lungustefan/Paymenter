import { Gateway } from '@/server/models/Gateway';
import { Server } from '@/server/models/Server';
import { Extension } from '@/server/models/Extension';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Cluster, Resource } from '../core/Resource';
import { Schema, Section, Grid, Select, TextInput, Toggle } from '../forms';
import { convertInput } from '../forms/convert';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { IconColumn } from '../tables/columns/IconColumn';
import { BulkActionGroup, Action } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { Notification } from '../Notification';
import type { Model } from '@/server/orm';

/* ---------------------------------------------------------------------------------------------
 * shared: the settings of an extension are rows of the `settings` table (`settings.<key>` in the form)
 * ------------------------------------------------------------------------------------------- */

async function loadSettings(record: Model<any>, data: Record<string, any>) {
    const settings: Record<string, any> = {};
    for (const setting of await (record as any).rel('settings')) settings[setting.key] = setting.value;
    return { ...data, settings };
}

async function saveSettings(record: any, data: Record<string, any>) {
    const config = await ExtensionHelper.getConfig(record.type, record.extension);
    for (const option of config) {
        const raw = data.settings?.[option.name];
        await record.relation('settings').updateOrCreate(
            { key: option.name, settingable_id: record.id, settingable_type: record.ctor.morphName },
            { type: option.database_type ?? 'string', value: raw !== undefined && raw !== null ? (Array.isArray(raw) ? JSON.stringify(raw) : raw) : null, encrypted: option.encrypted ?? false },
        );
    }
}

async function createWithSettings(Model: any, type: string, data: Record<string, any>) {
    const { settings, ...rest } = data;
    const record = await Model.create({ ...rest, type, enabled: true });
    if (settings) {
        for (const [key, value] of Object.entries(settings)) {
            if (value === null || value === undefined) continue;
            await record.relation('settings').updateOrCreate({ key }, { value });
        }
    }
    await ExtensionHelper.call(record, 'enabled', [record], true);
    return record;
}

/** `Grid::make()->schema(fn (Get $get) => ExtensionHelper::getConfigAsInputs(...))->key('settings')` */
function settingsGrid(type: string) {
    return Grid.make()
        .schema(async ({ get }) => (await ExtensionHelper.getConfigAsInputs(type, get('extension'), get('settings') ?? {})).map(convertInput))
        .key('settings');
}

const optionsOf = async (type: string) => (await ExtensionHelper.getExtensions(type)).map((e) => [e.name, e.name] as [string, string]);

const uniqueWithoutDeleted = (rule: any) => rule.where('deleted_at', null);

/* ---------------------------------------------------------------------------------------------
 * gateways
 * ------------------------------------------------------------------------------------------- */

export class GatewayResource extends Resource {
    static model = Gateway;
    static override getGloballySearchableAttributes() {
        return ['name'];
    }
    static override getGlobalSearchResultTitle(record: any) {
        return record.name;
    }
    static slug = 'gateways';
    static navigationGroup = 'Extensions';
    static navigationIcon = 'ri-secure-payment-line';
    static activeNavigationIcon = 'ri-secure-payment-fill';
    static globallySearchableAttributes = ['name'];

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('name').label('Name').required().maxLength(255).unique(this.model, 'name', null, true, uniqueWithoutDeleted).placeholder('Enter the name of the gateway'),
            Select.make('extension')
                .label('Gateway')
                .required()
                .searchable()
                .unique(this.model, 'extension', null, true, uniqueWithoutDeleted)
                .options(async () => optionsOf('gateway'))
                .live(true)
                .afterStateUpdated(({ set }) => set('settings', {}))
                .placeholder('Select the type of the gateway'),
            Section.make('Gateway Settings').columnSpanFull().description('Specific settings for the selected gateway').schema([settingsGrid('gateway')]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('name').searchable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListGateways.route('/'), create: CreateGateway.route('/create'), edit: EditGateway.route('/{record}/edit') };
    }
}

class CreateGateway extends CreateRecord {
    static override resource = GatewayResource;
    protected override mutateFormDataBeforeCreate(data: Record<string, any>) {
        return { ...data, type: 'gateway' };
    }
    protected override async handleRecordCreation(data: Record<string, any>) {
        return createWithSettings(Gateway, 'gateway', data);
    }
}

class EditGateway extends EditRecord {
    static override resource = GatewayResource;
    override getHeaderActions() {
        return [DeleteAction.make().before(({ record }) => ExtensionHelper.call(record, 'disabled', [record], true))];
    }
    protected override mutateFormDataBeforeFill(data: Record<string, any>) {
        return loadSettings(this.record, data);
    }
    protected override async handleRecordUpdate(record: Model<any>, data: Record<string, any>) {
        const { settings, ...rest } = data;
        await record.update(rest);
        if (!settings) return record;
        await saveSettings(record, data);
        await ExtensionHelper.call(record as any, 'updated', [record], true);
        return record.refresh();
    }
}

class ListGateways extends ListRecords {
    static override resource = GatewayResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

/* ---------------------------------------------------------------------------------------------
 * servers
 * ------------------------------------------------------------------------------------------- */

export class ServerResource extends Resource {
    static model = Server;
    static override getGloballySearchableAttributes() {
        return ['name'];
    }
    static override getGlobalSearchResultTitle(record: any) {
        return record.name;
    }
    static slug = 'servers';
    static navigationGroup = 'Extensions';
    static navigationIcon = 'ri-server-line';
    static activeNavigationIcon = 'ri-server-fill';
    static globallySearchableAttributes = ['name'];

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('name').label('Name').required().maxLength(255).unique(this.model, 'name', null, true, uniqueWithoutDeleted).placeholder('Enter the name of the server'),
            Select.make('extension')
                .label('Server')
                .required()
                .searchable()
                .options(async () => optionsOf('server'))
                .live(true)
                .disabledOn('edit')
                .afterStateUpdated(({ set }) => set('settings', {}))
                .placeholder('Select the type of the server')
                .hintAction(
                    Action.make('Test Configuration')
                        .action(async ({ get, record }) => {
                            const connection = await ExtensionHelper.testConfig(record, get('settings'));
                            if (connection === true) await Notification.make().title('Configuration is correct').success().send();
                            else await Notification.make().title(`Connection failed: ${connection}`).danger().send();
                        })
                        .label('Test Connection')
                        .hidden(async ({ record }) => !record || !(await ExtensionHelper.hasFunction(record, 'testConfig'))),
                ),
            Section.make('Server Settings').columnSpanFull().description('Specific settings for the selected server').schema([settingsGrid('server')]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('name').searchable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListServers.route('/'), create: CreateServer.route('/create'), edit: EditServer.route('/{record}/edit') };
    }
}

class CreateServer extends CreateRecord {
    static override resource = ServerResource;
    protected override mutateFormDataBeforeCreate(data: Record<string, any>) {
        return { ...data, type: 'server' };
    }
    protected override async handleRecordCreation(data: Record<string, any>) {
        return createWithSettings(Server, 'server', data);
    }
}

class EditServer extends EditRecord {
    static override resource = ServerResource;
    override getHeaderActions() {
        return [DeleteAction.make().before(({ record }) => ExtensionHelper.call(record, 'disabled', [record], true))];
    }
    protected override mutateFormDataBeforeFill(data: Record<string, any>) {
        return loadSettings(this.record, data);
    }
    protected override async handleRecordUpdate(record: Model<any>, data: Record<string, any>) {
        const { settings, ...rest } = data;
        await record.update(rest);
        if (!settings) return record;
        await saveSettings(record, data);
        await ExtensionHelper.call(record as any, 'updated', [record], true);
        return record.refresh();
    }
}

class ListServers extends ListRecords {
    static override resource = ServerResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

/* ---------------------------------------------------------------------------------------------
 * extensions (the other kinds), inside the Extensions cluster
 * ------------------------------------------------------------------------------------------- */

export class ExtensionsCluster extends Cluster {
    static slug = 'extensions';
    static navigationIcon = 'ri-puzzle-line';
    static activeNavigationIcon = 'ri-puzzle-fill';
    static navigationGroup = 'Extensions';
    static navigationSort = 0;
}

export class ExtensionResource extends Resource {
    static model = Extension;
    static override getGloballySearchableAttributes() {
        return ['name'];
    }
    static override getGlobalSearchResultTitle(record: any) {
        return record.name;
    }
    static slug = 'extensions';
    static cluster = ExtensionsCluster;
    static navigationIcon = 'ri-puzzle-line';
    static activeNavigationIcon = 'ri-puzzle-fill';
    static globallySearchableAttributes = ['name'];

    static override form(schema: Schema) {
        return schema.components([Toggle.make('enabled'), Section.make('Extension Settings').columnSpanFull().description('Specific settings for the selected extension').schema([settingsGrid('other')])]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('name').searchable().sortable(), TextColumn.make('type').searchable().sortable(), IconColumn.make('enabled').label('Enabled').boolean().sortable()])
            .filters([])
            .recordActions([EditAction.make()])
            .headerActions([Action.make('create').label('Install Extension').url(() => '/admin/extensions/extension?tab=installable')]);
    }

    static override getEloquentQuery() {
        return super.getEloquentQuery().whereNotIn('type', ['gateway', 'server']);
    }

    static override getPages() {
        return { index: ListExtensions.route('/'), edit: EditExtension.route('/{record}/edit') };
    }
}

class ListExtensions extends ListRecords {
    static override resource = ExtensionResource;
}

class EditExtension extends EditRecord {
    static override resource = ExtensionResource;
    override getHeaderActions() {
        return [
            Action.make('uninstall')
                .requiresConfirmation()
                .color('danger')
                .label('Uninstall Extension')
                .modalDescription('Are you sure you want to uninstall this extension? This will remove all its data and settings.')
                .action(async ({ record }) => {
                    await ExtensionHelper.call(record, 'uninstalled', [], true);
                    await record.delete();
                })
                .successRedirectUrl(() => ExtensionResource.getUrl('index')),
        ];
    }
    protected override mutateFormDataBeforeFill(data: Record<string, any>) {
        return loadSettings(this.record, data);
    }
    protected override getRedirectUrl() {
        return ExtensionResource.getUrl('edit', { record: this.record });
    }
    protected override async handleRecordUpdate(record: Model<any>, data: Record<string, any>) {
        const r = record as any;
        if (!!r.enabled !== !!data.enabled) await ExtensionHelper.call(r, data.enabled ? 'enabled' : 'disabled', [r], true);
        const { settings, ...rest } = data;
        await record.update(rest);
        if (!settings) return record;
        await saveSettings(record, data);
        await ExtensionHelper.call(r, 'updated', [r], true);
        return record.refresh();
    }
}
