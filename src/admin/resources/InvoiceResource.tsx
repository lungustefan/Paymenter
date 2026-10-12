import { Invoice } from '@/server/models/Invoice';
import { Currency } from '@/server/models/Currency';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { PDF } from '@/server/classes/PDF';
import { Carbon } from '@/server/lib/carbon';
import { Cluster, Resource } from '../core/Resource';
import { Schema, DatePicker, Hidden, Repeater, Select, TextInput, Toggle } from '../forms';
import { UserComponent } from '../components/UserComponent';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { SelectFilter } from '../tables/filters';
import { Action, BulkActionGroup, Download } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { AuditAction } from '../actions/AuditAction';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { RelationManager } from './RelationManager';
import { ServiceResource } from './ServiceResource';

export class InvoiceCluster extends Cluster {
    static slug = 'invoice';
    static navigationIcon = 'ri-receipt-line';
    static activeNavigationIcon = 'ri-receipt-fill';
    static navigationGroup = 'Administration';
    static navigationLabel = 'Invoices';

    static override async getNavigationBadge() {
        const count = await Invoice.query().where('status', 'pending').count();
        return count ? String(count) : null;
    }
    static override getNavigationBadgeColor() {
        return 'warning';
    }
}

const ucfirst = (s: unknown) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

class TransactionsRelationManager extends RelationManager {
    static override relationship = 'transactions';

    override form(schema: Schema) {
        return schema.components([
            Select.make('gateway.name').label('Gateway').relationship('gateway', 'name').searchable().preload().placeholder('Select the gateway'),
            TextInput.make('transaction_id').label('Transaction ID'),
            TextInput.make('amount').label('Amount').numeric().moneyMask().required(),
            TextInput.make('fee').numeric().moneyMask().label('Fee'),
        ]);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('transaction_id')
            .columns([
                TextColumn.make('gateway.name').label('Gateway'),
                TextColumn.make('transaction_id'),
                TextColumn.make('formattedAmount').label('Amount'),
                TextColumn.make('formattedFee').label('Fee'),
                TextColumn.make('created_at'),
            ])
            .filters([])
            .headerActions([CreateAction.make()])
            .recordActions([DeleteAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }
}

export class InvoiceResource extends Resource {
    static model = Invoice;
    static slug = 'invoices';
    static cluster = InvoiceCluster;
    static navigationIcon = 'ri-receipt-line';
    static activeNavigationIcon = 'ri-receipt-fill';

    static override async getNavigationBadge() {
        const count = await Invoice.query().where('status', 'pending').count();
        return count ? String(count) : null;
    }
    static override getNavigationBadgeColor() {
        return 'warning';
    }

    static override form(schema: Schema) {
        const currency = async (get: (path: string) => any) => (await Currency.query().where('code', get('../../currency_code')).first()) as any;
        return schema.components([
            UserComponent.make('user_id'),
            TextInput.make('number').label('Invoice Number').helperText('The invoice number will be generated automatically').disabled(),
            DatePicker.make('created_at')
                .label('Issued At')
                .required()
                .default(() => Carbon.now().toDateTimeString())
                .placeholder('Select the date and time the invoice was issued'),
            DatePicker.make('due_at')
                .label('Due At')
                .required()
                .default(() => Carbon.now().addUnit('day', 7).toDateTimeString())
                .placeholder('Select the date and time the invoice is due'),
            Select.make('status')
                .label('Status')
                .required()
                .options({ paid: 'Paid', pending: 'Pending', cancelled: 'Cancelled' })
                .default('pending')
                .placeholder('Select the status of the invoice'),
            Select.make('currency_code').label('Currency').required().relationship('currency', 'code').placeholder('Select the currency'),
            Toggle.make('send_email').label('Send Email').hiddenOn('edit').default(true),
            Repeater.make('items')
                .relationship('items')
                .label('Items')
                .columnSpanFull()
                .columns(2)
                .schema([
                    TextInput.make('price')
                        .label('Price')
                        // Grab invoice currency
                        .prefix(async ({ get }) => (await currency(get))?.prefix ?? null)
                        .suffix(async ({ get }) => (await currency(get))?.suffix ?? null)
                        .required()
                        .numeric()
                        .moneyMask()
                        .placeholder('Enter the price of the product'),
                    TextInput.make('quantity').label('Quantity').required().numeric().placeholder('Enter the quantity of the product'),
                    TextInput.make('description')
                        .label('Description')
                        .required()
                        .hintAction(
                            Action.make('View Service')
                                .url(({ get }) => ServiceResource.getUrl('edit', { record: get('reference_id') }))
                                .label('View Service')
                                .hidden(({ get }) => !['App\\Models\\Service', 'App\\Models\\ServiceUpgrade'].includes(get('reference_type'))),
                        )
                        .placeholder('Enter the description of the product'),
                    Hidden.make('reference_type'),
                    Hidden.make('reference_id'),
                ]),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('id').label('ID').searchable().sortable(),
                TextColumn.make('number').searchable().sortable(),
                TextColumn.make('user.name')
                    .label('User')
                    .searchable(true, ({ query, search }) => {
                        query.whereHas('user', (q) => void q.where('first_name', 'like', `%${search}%`).orWhere('last_name', 'like', `%${search}%`));
                    }),
                TextColumn.make('status')
                    .label('Status')
                    // Make first letter uppercase
                    .formatStateUsing(({ state }) => ucfirst(state))
                    .badge()
                    .color(({ state }) => ({ paid: 'success', pending: 'warning' })[state as string] ?? 'danger')
                    .searchable()
                    .sortable(),
                TextColumn.make('created_at').label('Issued At').date().searchable().sortable(),
                TextColumn.make('formattedTotal').label('Total'),
                TextColumn.make('formattedRemaining').label('Remaining'),
            ])
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .filters([SelectFilter.make('status').label('Status').options({ paid: 'Paid', pending: 'Pending', cancelled: 'Cancelled' })])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getRelations() {
        return [TransactionsRelationManager];
    }

    static override getPages() {
        return {
            index: ListInvoices.route('/'),
            create: CreateInvoice.route('/create'),
            // Always use id for invoice route binding in admin
            edit: EditInvoice.route('/{record}/edit'),
        };
    }
}

class CreateInvoice extends CreateRecord {
    static override resource = InvoiceResource;

    protected override async handleRecordCreation(data: Record<string, any>) {
        const invoice = new Invoice();
        invoice.fill(data);
        invoice.send_create_email = data.send_email ?? true;
        await invoice.save();
        return invoice;
    }
}

class EditInvoice extends EditRecord {
    static override resource = InvoiceResource;

    override getHeaderActions() {
        return [
            DeleteAction.make(),
            Action.make('pdf')
                .label('Download PDF')
                .action(async ({ record }) => {
                    const invoice = record as Invoice;
                    const pdf = await (await PDF.generateInvoice(invoice)).output();
                    return new Download(`invoice-${invoice.number ?? invoice.id}.pdf`, pdf, 'application/pdf');
                }),
            AuditAction.make().auditChildren(['items', 'transactions']),
        ];
    }
}

class ListInvoices extends ListRecords {
    static override resource = InvoiceResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

/* ---------------------------------------------------------------------------------------------
 * transactions (the other resource of the cluster)
 * ------------------------------------------------------------------------------------------- */

export class InvoiceTransactionResource extends Resource {
    static model = InvoiceTransaction;
    static slug = 'invoice-transactions';
    static cluster = InvoiceCluster;
    static navigationIcon = 'ri-wallet-2-line';
    static activeNavigationIcon = 'ri-wallet-2-fill';
    static recordTitleAttribute = 'transaction_id';

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('invoice_id')
                    .url(({ record }) => InvoiceResource.getUrl('edit', { record: record.invoice_id }))
                    .numeric()
                    .sortable(),
                TextColumn.make('gateway.name').sortable(),
                TextColumn.make('formattedAmount').label('Amount').sortable(),
                TextColumn.make('formattedFee').label('Fee').sortable(),
                TextColumn.make('transaction_id').searchable(),
                TextColumn.make('status')
                    .sortable()
                    .badge()
                    .color(({ record }) => ({ succeeded: 'success', processing: 'warning', failed: 'danger' })[(record as InvoiceTransaction).status as string] ?? null)
                    .formatStateUsing(({ state }) => ucfirst(state))
                    .label('Status'),
                TextColumn.make('created_at').dateTime().sortable().toggleable(true, true),
                TextColumn.make('updated_at').dateTime().sortable().toggleable(true, true),
            ])
            .filters([])
            .defaultSort('created_at', 'desc')
            .recordActions([DeleteAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListInvoiceTransactions.route('/') };
    }
}

class ListInvoiceTransactions extends ListRecords {
    static override resource = InvoiceTransactionResource;
}
