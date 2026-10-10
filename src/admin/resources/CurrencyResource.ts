import { Currency } from '@/server/models/Currency';
import { Resource } from '../core/Resource';
import { Schema, TextInput, Select } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { Notification } from '../Notification';
import { Cart } from '@/server/models/Cart';
import { PriceModel as Price } from '@/server/models/Price';
import { config } from '@/server/config';

export class CurrencyResource extends Resource {
    static model = Currency;
    static slug = 'currencies';
    static navigationGroup = 'Configuration';
    static navigationIcon = 'ri-money-dollar-circle-line';
    static activeNavigationIcon = 'ri-money-dollar-circle-fill';

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('code').label('Code').required().maxLength(3).disabledOn('edit').unique(this.model, 'code', null, true).placeholder('Enter the currency code'),
            TextInput.make('name').label('Name').helperText('Display name for customers, e.g., US Dollar').required().maxLength(255).placeholder('Enter the currency name'),
            TextInput.make('prefix').label('Prefix').maxLength(10).placeholder('Enter the currency prefix'),
            TextInput.make('suffix').label('Suffix').maxLength(10).placeholder('Enter the currency suffix'),
            Select.make('format')
                .label('Format')
                .options([
                    ['1.000,00', '1.000,00'],
                    ['1,000.00', '1,000.00'],
                    ['1 000,00', '1 000,00'],
                    ['1 000.00', '1 000.00'],
                ])
                .default('1.000,00'),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([TextColumn.make('code').label('Code').searchable().sortable(), TextColumn.make('prefix').label('Prefix').searchable().sortable(), TextColumn.make('suffix').label('Suffix').searchable().sortable()])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return {
            index: ListCurrencies.route('/'),
            create: CreateCurrency.route('/create'),
            edit: EditCurrency.route('/{record}/edit'),
        };
    }
}

class CreateCurrency extends CreateRecord {
    static override resource = CurrencyResource;
}

class ListCurrencies extends ListRecords {
    static override resource = CurrencyResource;

    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

class EditCurrency extends EditRecord {
    static override resource = CurrencyResource;

    override getHeaderActions() {
        if (config('settings.default_currency') === this.record!.code) return [];
        return [
            DeleteAction.make()
                .before(async ({ action, record }) => {
                    // Prevent deletion if its being used by services/orders/credits
                    const serviceCount = await record.relation('services').count();
                    const orderCount = await record.relation('orders').count();
                    const creditCount = await record.relation('credits').where('amount', '>', 0).count();
                    if (serviceCount > 0 || orderCount > 0 || creditCount > 0) {
                        let message = 'Cannot delete currency because it is being used by ';
                        const parts: string[] = [];
                        if (serviceCount > 0) parts.push(`${serviceCount} service(s)`);
                        if (orderCount > 0) parts.push(`${orderCount} order(s)`);
                        if (creditCount > 0) parts.push(`${creditCount} credit(s)`);
                        message += parts.join(', ') + '.';
                        await Notification.make().title('Whoops!').body(message).danger().send();
                        action.cancel();
                    }
                })
                .after(async ({ record }) => {
                    // Remove carts with this currency
                    await Cart.query().where('currency_code', record.code).delete();
                    await Price.query().where('currency_code', record.code).delete();
                }),
        ];
    }
}
