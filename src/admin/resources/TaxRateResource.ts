import { TaxRate } from '@/server/models/TaxRate';
import { setting } from '@/server/config';
import countriesJson from '@/server/data/countries.json';
import { Resource } from '../core/Resource';
import { Schema, TextInput, Select } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { BulkActionGroup } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import type { User } from '@/server/models/User';

const countries = countriesJson as Record<string, string>;

export class TaxRateResource extends Resource {
    static model = TaxRate;
    static slug = 'tax-rates';
    static navigationGroup = 'Configuration';
    static navigationIcon = 'ri-wallet-3-line';

    static override form(schema: Schema) {
        const options = [['all', 'All Countries'] as [string, string], ...Object.entries(countries).filter(([code]) => code !== '')];
        return schema.components([
            TextInput.make('name').label('Name').required().maxLength(255).placeholder('Enter the name of the tax rate'),
            TextInput.make('rate').label('Rate').moneyMask().required().suffix('%').placeholder('Enter the rate of the tax rate'),
            Select.make('country').label('Country').required().unique(null, 'country', null, true).options(options),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('name').label('Name').searchable().sortable(),
                TextColumn.make('rate').label('Rate').searchable().sortable(),
                TextColumn.make('country')
                    .formatStateUsing(({ state }) => countries[state as string] ?? 'All Countries')
                    .label('Country')
                    .searchable()
                    .sortable(),
            ])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override canAccess(user: User | null) {
        return setting('tax_enabled') ? this.canViewAny(user) : false;
    }

    static override getPages() {
        return {
            index: ListTaxRates.route('/'),
            create: CreateTaxRate.route('/create'),
            edit: EditTaxRate.route('/{record}/edit'),
        };
    }
}

class CreateTaxRate extends CreateRecord {
    static override resource = TaxRateResource;
}

class EditTaxRate extends EditRecord {
    static override resource = TaxRateResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}

class ListTaxRates extends ListRecords {
    static override resource = TaxRateResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
