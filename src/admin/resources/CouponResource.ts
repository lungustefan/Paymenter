import { Coupon } from '@/server/models/Coupon';
import { setting } from '@/server/config';
import { Resource } from '../core/Resource';
import { Schema, DatePicker, Select, TextInput } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { Action, BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { RelationManager } from './RelationManager';

export const serviceUrl = (id: string | number) => `/admin/services/services/${id}/edit`;

class ServicesRelationManager extends RelationManager {
    static override relationship = 'services';

    override table(table: Table) {
        return table
            .recordTitleAttribute('id')
            .columns([TextColumn.make('id'), TextColumn.make('order.user.name').label('User'), TextColumn.make('product.name').label('Product')])
            .filters([])
            .headerActions([])
            .recordActions([Action.make('view').label('View').url(({ record }) => serviceUrl(record.id))])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }
}

export class CouponResource extends Resource {
    static model = Coupon;
    static slug = 'coupons';
    static navigationIcon = 'ri-coupon-line';
    static activeNavigationIcon = 'ri-coupon-fill';
    static navigationGroup = 'Configuration';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('code').label('Code').required().maxLength(255).unique(this.model, 'code', null, true).placeholder('Enter the code of the coupon'),
            TextInput.make('value')
                .label('Value')
                .required()
                .numeric()
                .minValue(0)
                .maxValue(({ get }) => (get('type') === 'percentage' ? 100 : null))
                .moneyMask()
                .suffix(({ get }) => (get('type') === 'percentage' ? '%' : setting('default_currency')))
                .placeholder('Enter the value of the coupon'),
            Select.make('type')
                .label('Type')
                .required()
                .default('percentage')
                .live()
                .options({ percentage: 'Percentage', fixed: 'Fixed amount' })
                .placeholder('Select the type of the coupon'),
            Select.make('applies_to').label('Applies To').required().default('all').options({ all: 'Price and Setup Fee', price: 'Price only', setup_fee: 'Setup Fee only' }),
            TextInput.make('recurring')
                .label('Recurring')
                .numeric()
                .nullable()
                .minValue(0)
                .hidden(({ get }) => get('applies_to') === 'free_setup')
                .placeholder('How many billing cycles the discount will be applied')
                .helperText('Enter 0 to apply it to all billing cycles, 1 (or leave empty) to apply it only to the first billing cycle, etc.'),
            TextInput.make('max_uses').label('Max Uses').numeric().minValue(0).placeholder('Enter the maximum number of total uses of the coupon'),
            TextInput.make('max_uses_per_user').label('Max Uses Per User').numeric().minValue(0).placeholder('Enter the maximum number of uses per user'),
            DatePicker.make('starts_at').label('Starts At'),
            DatePicker.make('expires_at').label('Expires At'),
            Select.make('products')
                .label('Products')
                .relationship('products', 'name', (q) => q.with('category'))
                .getOptionLabelFromRecordUsing(async (record: any) => `${record.name} - ${(await record.rel('category')).name} (#${record.id})`)
                .multiple()
                .preload()
                .placeholder('Select the products that this coupon applies to')
                .hint('Leave empty to apply the coupon to all products'),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('code').searchable(), TextColumn.make('value').searchable().formatStateUsing(({ record }) => `${record.value}${record.type === 'percentage' ? '%' : setting('default_currency')}`)])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getRelations() {
        return [ServicesRelationManager];
    }

    static override getPages() {
        return { index: ListCoupons.route('/'), create: CreateCoupon.route('/create'), edit: EditCoupon.route('/{record}/edit') };
    }
}

class CreateCoupon extends CreateRecord {
    static override resource = CouponResource;
}
class EditCoupon extends EditRecord {
    static override resource = CouponResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListCoupons extends ListRecords {
    static override resource = CouponResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
