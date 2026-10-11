import { Category } from '@/server/models/Category';
import { slug } from '@/server/lib/php';
import { Resource } from '../core/Resource';
import { Schema, FileUpload, RichEditor, Select, TextInput } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { Notification } from '../Notification';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { RelationManager } from './RelationManager';
import { ProductResource } from './ProductResource';

const cannotDelete = () =>
    Notification.make().title('Cannot delete category').body('The category has products or children categories.').duration(5000).icon('ri-error-warning-line').danger().send();

class ProductsRelationManager extends RelationManager {
    static override relationship = 'products';
    static override relatedResource = () => ProductResource;

    override table(table: Table) {
        return table.reorderable('sort').headerActions([CreateAction.make()]);
    }
}

export class CategoryResource extends Resource {
    static model = Category;
    static slug = 'categories';
    static navigationGroup = 'Administration';
    static navigationIcon = 'ri-folder-6-line';
    static activeNavigationIcon = 'ri-folder-6-fill';
    static navigationSort = 1;

    static override form(schema: Schema) {
        return schema
            .components([
                TextInput.make('name')
                    .required()
                    .maxLength(255)
                    .live(true)
                    .afterStateUpdated(({ get, set, old, state }) => {
                        if ((get('slug') ?? '') !== slug(old ?? '')) return;
                        set('slug', slug(state ?? ''));
                    }),
                TextInput.make('slug').required(),
                RichEditor.make('description').required(),
                Select.make('parent_id')
                    .relationship('parent', 'name')
                    .searchable()
                    .preload()
                    .label('Parent Category')
                    // Disallow having same category as it's own parent
                    .disableOptionWhen((value, _label, record) => !!record && Number(value) === Number((record as any).id)),
                FileUpload.make('image').label('Image').nullable().visibility('public').disk('public').acceptedFileTypes(['image/*']).columnSpanFull(),
            ])
            .columns(2);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('name').searchable().sortable(), TextColumn.make('slug').searchable().sortable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([
                BulkActionGroup.make([
                    DeleteBulkAction.make().before(async ({ records, action }) => {
                        for (const record of (records ?? []) as any[]) {
                            if ((await record.relation('products').exists()) || (await record.relation('children').exists())) {
                                await cannotDelete();
                                action.cancel();
                            }
                        }
                    }),
                ]),
            ])
            .defaultSort((q) => q.orderBy('sort', 'asc'))
            .reorderable('sort');
    }

    static override getRelations() {
        return [ProductsRelationManager];
    }

    static override getPages() {
        return { index: ListCategories.route('/'), create: CreateCategory.route('/create'), edit: EditCategory.route('/{record}/edit') };
    }
}

class CreateCategory extends CreateRecord {
    static override resource = CategoryResource;
}

class EditCategory extends EditRecord {
    static override resource = CategoryResource;
    override getHeaderActions() {
        return [
            DeleteAction.make().before(async ({ action }) => {
                const record = this.record as any;
                if ((await record.relation('products').exists()) || (await record.relation('children').exists())) {
                    await cannotDelete();
                    action.cancel();
                }
            }),
        ];
    }
}

class ListCategories extends ListRecords {
    static override resource = CategoryResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
