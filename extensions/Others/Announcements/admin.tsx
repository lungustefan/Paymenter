import { Resource } from '@/admin/core/Resource';
import { Schema, DateTimePicker, RichEditor, TextInput, Toggle } from '@/admin/forms';
import { Table } from '@/admin/tables/Table';
import { TextColumn } from '@/admin/tables/columns/TextColumn';
import { IconColumn } from '@/admin/tables/columns/IconColumn';
import { BulkActionGroup } from '@/admin/actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '@/admin/actions/builtin';
import { CreateRecord } from '@/admin/pages/resource/CreateRecord';
import { EditRecord } from '@/admin/pages/resource/EditRecord';
import { ListRecords } from '@/admin/pages/resource/ListRecords';
import { Announcement } from './Announcement';

/** `Str::slug()` */
const slugify = (s: string | null | undefined) =>
    String(s ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/** Paymenter\Extensions\Others\Announcements\Admin\Resources\AnnouncementResource */
export class AnnouncementResource extends Resource {
    static model = Announcement;
    static slug = 'announcements';
    static navigationIcon = 'ri-megaphone-line';
    static activeNavigationIcon = 'ri-megaphone-fill';
    static navigationGroup = 'Administration';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('title')
                .label('Title')
                .required()
                .maxLength(255)
                .live(true)
                .afterStateUpdated(({ get, set, old, state }) => {
                    if ((get('slug') ?? '') !== slugify(old as string)) return;
                    set('slug', slugify(state as string));
                })
                .placeholder('Enter the title of the announcement'),
            TextInput.make('slug').label('Slug').required().maxLength(255).placeholder('Enter the slug of the announcement'),
            TextInput.make('description').label('Description').required().maxLength(255).placeholder('Short description to show on the announcement list'),
            DateTimePicker.make('published_at').label('Published At').required().placeholder('Enter the date and time when the announcement should be published'),
            Toggle.make('is_active').label('Is Published').default(false),
            RichEditor.make('content').columnSpanFull().label('Content').required().placeholder('Enter the content of the announcement'),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('title').searchable().sortable(), TextColumn.make('published_at').searchable().dateTime().sortable(), IconColumn.make('is_active').label('Published').boolean().sortable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListAnnouncements.route('/'), create: CreateAnnouncement.route('/create'), edit: EditAnnouncement.route('/{record}/edit') };
    }
}

class CreateAnnouncement extends CreateRecord {
    static override resource = AnnouncementResource;
}
class EditAnnouncement extends EditRecord {
    static override resource = AnnouncementResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListAnnouncements extends ListRecords {
    static override resource = AnnouncementResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

export default () => ({ resources: [AnnouncementResource] });
