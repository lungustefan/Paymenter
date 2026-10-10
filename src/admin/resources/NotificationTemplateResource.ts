import { NotificationTemplate } from '@/server/models/NotificationTemplate';
import { NotificationEnabledStatus as S } from '@/server/enums';
import { Resource } from '../core/Resource';
import { Schema, Section, Select, TagsInput, TextInput, Toggle, MarkdownEditor } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { IconColumn } from '../tables/columns/IconColumn';
import { CreateAction, DeleteAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';

const statuses = [
    [S.ChoiceOn, 'User Choice, Default On'],
    [S.ChoiceOff, 'User Choice, Default Off'],
    [S.Force, 'Force On'],
    [S.Never, 'Force Off'],
] as Array<[string, string]>;

export class NotificationTemplateResource extends Resource {
    static model = NotificationTemplate;
    static slug = 'notification-templates';
    static navigationIcon = 'ri-mail-settings-line';
    static activeNavigationIcon = 'ri-mail-settings-fill';
    static navigationGroup = 'Other';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('key').required().disabledOn('edit').maxLength(255),
            Toggle.make('enabled').required(),
            TextInput.make('edit_preference_message').label('Edit Preference Message').hint('This message will be shown to users when they edit their notification preferences for this template.').columnSpanFull(),
            Section.make('Email Template')
                .description('Define the subject and body of the email template. You can use either Markdown or HTML for the body content.')
                .columns(2)
                .columnSpanFull()
                .collapsible()
                .schema([
                    TextInput.make('subject').required().maxLength(255),
                    Select.make('mail_enabled').label('Mail Enabled').options(statuses).required(),
                    MarkdownEditor.make('body').hint('Use either Markdown or HTML to compose the email body.').disableAllToolbarButtons().required().columnSpanFull(),
                    TagsInput.make('cc').placeholder('mail@example.com').nestedRecursiveRules(['required', 'email']),
                    TagsInput.make('bcc').nestedRecursiveRules(['required', 'email']).placeholder('mail@example.com'),
                ]),
            Section.make('In-App Notification (push)')
                .description('Define the title and body of the in-app notification that users will receive.')
                .columns(2)
                .columnSpanFull()
                .collapsible()
                .schema([
                    TextInput.make('in_app_title')
                        .label('In-App Title')
                        .required(({ get }) => get('in_app_enabled') !== S.Never)
                        .disabled(({ get }) => get('in_app_enabled') === S.Never)
                        .maxLength(255),
                    Select.make('in_app_enabled').label('In-App Enabled').options(statuses).live().required(),
                    TextInput.make('in_app_body')
                        .label('In-App Body')
                        .required(({ get }) => get('in_app_enabled') !== S.Never)
                        .disabled(({ get }) => get('in_app_enabled') === S.Never)
                        .columnSpanFull(),
                    TextInput.make('in_app_url')
                        .label('In-App URL')
                        .maxLength(255)
                        .placeholder('{{ route("invoices.show", $invoice) }}')
                        .hint('Supports dynamic variables like {{ route("invoices.show", $invoice) }}')
                        .disabled(({ get }) => get('in_app_enabled') === S.Never)
                        .columnSpanFull(),
                ]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('subject').searchable(), IconColumn.make('enabled').boolean()])
            .filters([])
            .recordActions([EditAction.make()]);
    }

    static override getPages() {
        return {
            index: ListNotificationTemplates.route('/'),
            create: CreateNotificationTemplate.route('/create'),
            edit: EditNotificationTemplate.route('/{record}/edit'),
        };
    }
}

class CreateNotificationTemplate extends CreateRecord {
    static override resource = NotificationTemplateResource;
}
class EditNotificationTemplate extends EditRecord {
    static override resource = NotificationTemplateResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListNotificationTemplates extends ListRecords {
    static override resource = NotificationTemplateResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
