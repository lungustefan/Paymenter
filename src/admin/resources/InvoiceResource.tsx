import { redirect } from 'next/navigation';
import { Invoice } from '@/server/models/Invoice';
import { AdjustmentNote } from '@/server/models/AdjustmentNote';
import { AdjustmentNoteStatus, AdjustmentNoteType } from '@/server/enums';
import { setting } from '@/server/config';
import { t } from '@/server/i18n';
import { ExtensionHelper } from '@/server/extensions/helper';
import { canFilament as can } from '@/server/policies';
import { Currency } from '@/server/models/Currency';
import { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import { PDF } from '@/server/classes/PDF';
import { Carbon } from '@/server/lib/carbon';
import { Cluster, Resource } from '../core/Resource';
import { Schema, DatePicker, Hidden, Repeater, Section, Select, Textarea, TextInput, Toggle } from '../forms';
import { TextEntry, ViewEntry } from '../infolists';
import { Notification } from '../Notification';
import { UserComponent } from '../components/UserComponent';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { SelectFilter } from '../tables/filters';
import { Action, BulkActionGroup, Download, Halt } from '../actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction, ViewAction } from '../actions/builtin';
import { AuditAction } from '../actions/AuditAction';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { ViewRecord } from '../pages/resource/ViewRecord';
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

const immutable = () => !!setting('immutable_invoices_enabled', false);
/** where the invoice is shown: the read-only view with immutable invoices, the edit form otherwise */
const invoicePage = () => (immutable() ? 'view' : 'edit');
const invoiceStatusColor = ({ state }: { state?: unknown }) => ({ paid: 'success', pending: 'warning', draft: 'gray' })[state as string] ?? 'danger';

/** credit notes are negative amounts, debit notes positive ones */
const noteTypeFromAmount = ({ state, set }: { state: unknown; set: (path: string, value: any) => void }) => {
    if (state !== null && state !== '' && !Number.isNaN(Number(state))) set('type', Number(state) < 0 ? AdjustmentNoteType.Credit : AdjustmentNoteType.Debit);
};

function adjustmentNoteForm(schema: Schema, withInvoice: boolean) {
    return schema.components([
        ...(withInvoice
            ? [
                  Select.make('invoice_id')
                      .label('Invoice')
                      .relationship('invoice', 'number', (q) => void q.orderBy('id', 'desc'))
                      .getOptionLabelFromRecordUsing(async (record: any) => {
                          const user = await record.rel('user');
                          return `${record.number ? '#' + record.number : record.id} (${user?.email ?? t('invoices.deleted_user')})`;
                      })
                      .required()
                      .searchable()
                      .preload()
                      .disabledOn('edit')
                      .placeholder('Select an invoice'),
              ]
            : []),
        TextInput.make('number').label('Number').helperText('The number will be generated automatically').disabled().dehydrated(false),
        Hidden.make('type').default(AdjustmentNoteType.Credit),
        TextInput.make('amount')
            .label('Amount')
            .required()
            .numeric()
            .live()
            .afterStateUpdated(noteTypeFromAmount as any)
            .moneyMask()
            .placeholder('Enter the amount (negative = credit, positive = debit)'),
        Textarea.make('description').label('Description').placeholder('Enter a description'),
        Select.make('status')
            .label('Status')
            .options({ [AdjustmentNoteStatus.Active]: 'Active', [AdjustmentNoteStatus.Voided]: 'Voided' })
            .default(AdjustmentNoteStatus.Active)
            .required(),
    ]);
}

function adjustmentNoteColumns(withInvoice: boolean) {
    return [
        ...(withInvoice ? [TextColumn.make('id').label('ID').searchable().sortable()] : []),
        TextColumn.make('number').searchable().sortable(),
        ...(withInvoice ? [TextColumn.make('invoice.number').label('Invoice').searchable().sortable()] : []),
        TextColumn.make('type')
            .label('Type')
            .badge()
            .color(({ state }) => ({ credit: 'success', debit: 'danger' })[state as string] ?? 'gray')
            .formatStateUsing(({ state }) => ucfirst(state))
            .sortable(),
        TextColumn.make('formattedAmount').label('Amount').sortable(),
        TextColumn.make('status')
            .label('Status')
            .badge()
            .color(({ state }) => ({ active: 'success', voided: 'danger' })[state as string] ?? 'gray')
            .formatStateUsing(({ state }) => ucfirst(state))
            .sortable(),
        TextColumn.make('description').label('Description').limit(50).searchable(),
        TextColumn.make('created_at').label('Created At').dateTime().sortable(),
    ];
}

/** cancel an invoice with a reason (a credit note for the total is added by the observer) */
const cancelAction = () =>
    Action.make('cancel')
        .label('Cancel')
        .icon('heroicon-o-x-circle')
        .color('danger')
        .requiresConfirmation()
        .form([TextInput.make('cancellation_reason').label('Cancellation Reason').required()])
        .action(async ({ record, data }) => {
            await (record as Invoice).update({ status: Invoice.STATUS_CANCELLED, cancellation_reason: data!.cancellation_reason });
        });

/** with immutable invoices the transactions / notes of an invoice can only be changed while it is pending */
const canModifyLedger = (owner: any) => !immutable() || owner?.status === Invoice.STATUS_PENDING;

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

    private refundNotification(success: boolean, error?: string) {
        const n = Notification.make().title(t(success ? 'invoices.refund_success' : 'invoices.refund_failed'));
        return (success ? n.success() : n.body(error ?? '').danger()).send();
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('transaction_id')
            .columns([
                TextColumn.make('gateway.name').label('Gateway'),
                TextColumn.make('transaction_id'),
                TextColumn.make('formattedAmount').label('Amount'),
                TextColumn.make('formattedRefundedAmount').label(t('invoices.refunded_amount')),
                TextColumn.make('formattedFee').label('Fee'),
                TextColumn.make('created_at'),
            ])
            .filters([])
            .headerActions([CreateAction.make().visible(() => canModifyLedger(this.ownerRecord))])
            .recordActions([
                Action.make('refund')
                    .label(t('invoices.refund'))
                    .icon('heroicon-o-backward')
                    .color('warning')
                    .modalHeading(({ record }) => t('invoices.refund_transaction', { id: (record as any).transaction_id ?? (record as any).id }))
                    .modalDescription(async ({ record }) => t('invoices.refundable_amount', { amount: String(await (record as any).formattedRefundableAmount()) }))
                    .form(async ({ record }) => {
                        const tr = record as InvoiceTransaction;
                        const currency = await (await tr.rel('invoice')).rel('currency');
                        const gateway = await tr.rel('gateway');
                        const viaGateway = !!gateway && !!gateway.extension && (await ExtensionHelper.hasFunction(gateway as any, 'supportsRefunds')) && (await ExtensionHelper.hasFunction(gateway as any, 'refund'));
                        const max = tr.refundableAmount();
                        const maxLabel = String(await tr.formattedRefundableAmount());
                        return [
                            TextInput.make('amount')
                                .label(t('invoices.amount'))
                                .numeric()
                                .prefix(currency?.prefix ?? null)
                                .suffix(currency?.suffix ?? null)
                                .moneyMask()
                                .required()
                                .rule((value: any, fail: (m: string) => void) => {
                                    if (Number(value) <= 0) fail(t('invoices.refund_amount_positive'));
                                    if (Number(value) > max) fail(t('invoices.refund_amount_exceeds_refundable', { max: maxLabel }));
                                }),
                            ...(viaGateway ? [Toggle.make('refund_via_gateway').label(t('invoices.refund_via_gateway')).default(false)] : []),
                        ];
                    })
                    .action(async ({ record, data }) => {
                        const tr = record as InvoiceTransaction;
                        try {
                            if (data?.refund_via_gateway && (await tr.rel('gateway'))) await ExtensionHelper.refund(tr, Number(data.amount));
                            else await ExtensionHelper.refundLocally(tr, Number(data!.amount));
                            await this.refundNotification(true);
                        } catch (e: any) {
                            await this.refundNotification(false, e?.message);
                            throw new Halt();
                        }
                    })
                    .visible(async ({ record, user }) => {
                        const tr = record as InvoiceTransaction;
                        return !!tr.transaction_id && tr.refundableAmount() > 0 && (await can(user ?? null, 'update', tr));
                    })
                    .modalSubmitActionLabel(() => t('invoices.refund')),
                DeleteAction.make().visible(() => canModifyLedger(this.ownerRecord)),
            ])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make().visible(() => canModifyLedger(this.ownerRecord))])]);
    }
}

class AdjustmentNotesRelationManager extends RelationManager {
    static override relationship = 'adjustmentNotes';
    static override title = 'Adjustment Notes';

    override form(schema: Schema) {
        return adjustmentNoteForm(schema, false);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('number')
            .columns(adjustmentNoteColumns(false))
            .headerActions([CreateAction.make().visible(() => canModifyLedger(this.ownerRecord))])
            .recordActions([EditAction.make().visible(() => canModifyLedger(this.ownerRecord)), DeleteAction.make().visible(() => canModifyLedger(this.ownerRecord))])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make().visible(() => canModifyLedger(this.ownerRecord))])])
            .defaultSort('created_at', 'desc');
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
                .options({ paid: 'Paid', pending: 'Pending', draft: 'Draft', cancelled: 'Cancelled' })
                .default(() => (immutable() ? Invoice.STATUS_DRAFT : Invoice.STATUS_PENDING))
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
                    .color(invoiceStatusColor)
                    .searchable()
                    .sortable(),
                TextColumn.make('created_at').label('Issued At').date().searchable().sortable(),
                TextColumn.make('formattedTotal').label('Total'),
                TextColumn.make('formattedCurrentBalance').label('Remaining'),
            ])
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .filters([SelectFilter.make('status').label('Status').options({ paid: 'Paid', pending: 'Pending', draft: 'Draft', cancelled: 'Cancelled' })])
            .recordActions([
                ViewAction.make().visible(() => immutable()),
                EditAction.make(),
                cancelAction().visible(async ({ record, user }) => (await can(user ?? null, 'update', Invoice)) && ![Invoice.STATUS_CANCELLED, Invoice.STATUS_PAID].includes((record as Invoice).status)),
            ]);
    }

    static override infolist(schema: Schema) {
        return schema.columns(1).components([
            Section.make('Invoice Details')
                .columns(3)
                .schema([
                    TextEntry.make('number').label('Invoice Number'),
                    TextEntry.make('user.name').label('User').placeholder(t('invoices.deleted_user')),
                    TextEntry.make('status').label('Status').badge().color(invoiceStatusColor).formatStateUsing(({ state }) => ucfirst(state)),
                    TextEntry.make('currency.code').label('Currency'),
                    TextEntry.make('created_at').label('Issued At').dateTime(),
                    TextEntry.make('due_at').label('Due At').date(),
                    TextEntry.make('formattedTotal').label('Total'),
                    TextEntry.make('formattedCurrentBalance').label('Remaining'),
                    TextEntry.make('cancellation_reason').label('Cancellation Reason').visible(({ record }: any) => !!record?.cancellation_reason),
                ]),
            Section.make('Items').schema([
                ViewEntry.make('items')
                    .label('')
                    .columnSpanFull()
                    .state(async ({ record }: any) => (record as Invoice).rel('items'))
                    .view(async ({ state }) => {
                        const rows = await Promise.all(
                            ((state ?? []) as any[]).map(async (item) => {
                                const reference = ['App\\Models\\Service', 'App\\Models\\ServiceUpgrade'].includes(item.reference_type) ? await item.rel('reference') : null;
                                const serviceId = reference ? (item.reference_type === 'App\\Models\\Service' ? item.reference_id : reference.service_id) : null;
                                return { id: item.id, description: item.description, price: String(await item.formattedPrice()), quantity: item.quantity, serviceId };
                            }),
                        );
                        return (
                            <table className="w-full text-start text-sm" data-testid="invoice-items">
                                <thead>
                                    <tr>
                                        <th className="text-start">Description</th>
                                        <th className="text-start">Price</th>
                                        <th className="text-start">Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id}>
                                            <td>{r.serviceId ? <a className="text-primary-600 hover:underline" href={ServiceResource.getUrl('edit', { record: r.serviceId })}>{r.description}</a> : r.description}</td>
                                            <td>{r.price}</td>
                                            <td>{r.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    }),
            ]),
        ]);
    }

    static override getRelations() {
        return [TransactionsRelationManager, AdjustmentNotesRelationManager];
    }

    static override getPages() {
        return {
            index: ListInvoices.route('/'),
            create: CreateInvoice.route('/create'),
            // Always use id for invoice route binding in admin
            view: ViewInvoice.route('/{record}'),
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

    override async mount() {
        // with immutable invoices only a draft has an edit form
        const record = await this.resolveRecord(this.params.record);
        if (immutable() && (record as Invoice).status !== Invoice.STATUS_DRAFT) redirect(InvoiceResource.getUrl('view', { record }));
        await super.mount();
    }

    override getHeaderActions() {
        return [
            Action.make('publish')
                .label('Publish')
                .requiresConfirmation()
                .color('success')
                .icon('heroicon-o-check-circle')
                .visible(({ record }) => (record as Invoice).status === Invoice.STATUS_DRAFT)
                .action(async ({ record }) => {
                    const invoice = record as Invoice;
                    invoice.status = Invoice.STATUS_PENDING;
                    await invoice.save();
                })
                .successRedirectUrl(() => InvoiceResource.getUrl('index')),
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

class ViewInvoice extends ViewRecord {
    static override resource = InvoiceResource;

    override async mount() {
        if (!immutable()) redirect(InvoiceResource.getUrl('edit', { record: this.params.record }));
        await super.mount();
    }

    override getHeaderActions() {
        return [
            cancelAction()
                .label('Cancel Invoice')
                .visible(({ record }) => (record as Invoice).status !== Invoice.STATUS_CANCELLED),
            Action.make('pdf')
                .label('Download PDF')
                .action(async ({ record }) => {
                    const invoice = record as Invoice;
                    const pdf = await (await PDF.generateInvoice(invoice)).output();
                    return new Download(`invoice-${invoice.number ?? invoice.id}.pdf`, pdf, 'application/pdf');
                }),
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
                    .url(({ record }) => InvoiceResource.getUrl(invoicePage(), { record: record.invoice_id }))
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

/* ---------------------------------------------------------------------------------------------
 * adjustment notes (credit / debit notes)
 * ------------------------------------------------------------------------------------------- */

export class AdjustmentNoteResource extends Resource {
    static model = AdjustmentNote;
    static slug = 'adjustment-notes';
    static cluster = InvoiceCluster;
    static navigationIcon = 'ri-scales-line';
    static activeNavigationIcon = 'ri-scales-fill';
    static navigationLabel = 'Adjustment Notes';
    static navigationSort = 3;

    static override shouldRegisterNavigation() {
        return immutable();
    }

    static override form(schema: Schema) {
        return adjustmentNoteForm(schema, true);
    }

    static override table(table: Table) {
        return table
            .columns(adjustmentNoteColumns(true))
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return {
            index: ListAdjustmentNotes.route('/'),
            create: CreateAdjustmentNote.route('/create'),
            edit: EditAdjustmentNote.route('/{record}/edit'),
        };
    }
}

class ListAdjustmentNotes extends ListRecords {
    static override resource = AdjustmentNoteResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

class CreateAdjustmentNote extends CreateRecord {
    static override resource = AdjustmentNoteResource;
    protected override getRedirectUrl() {
        return AdjustmentNoteResource.getUrl('index');
    }
}

class EditAdjustmentNote extends EditRecord {
    static override resource = AdjustmentNoteResource;
    protected override getRedirectUrl() {
        return AdjustmentNoteResource.getUrl('index');
    }

    override getHeaderActions() {
        const voided = (record: any) => record.status === AdjustmentNoteStatus.Voided;
        return [
            Action.make('void')
                .label(({ record }) => (voided(record) ? 'Unvoid' : 'Void'))
                .color(({ record }) => (voided(record) ? 'success' : 'danger'))
                .icon(({ record }) => (voided(record) ? 'heroicon-o-arrow-uturn-left' : 'heroicon-o-x-circle'))
                .requiresConfirmation()
                .modalHeading(({ record }) => (voided(record) ? 'Unvoid adjustment note' : 'Void adjustment note'))
                .modalDescription(({ record }) =>
                    voided(record)
                        ? 'Are you sure you want to unvoid this adjustment note? Its amount will be included in the invoice total again.'
                        : 'Are you sure you want to void this adjustment note? Its amount will be excluded from the invoice total.',
                )
                .modalSubmitActionLabel(({ record }) => (voided(record) ? 'Unvoid' : 'Void'))
                .action(async ({ record }) => {
                    const note = record as AdjustmentNote;
                    const next = voided(note) ? AdjustmentNoteStatus.Active : AdjustmentNoteStatus.Voided;
                    await note.update({ status: next });
                    await Notification.make().title(next === AdjustmentNoteStatus.Voided ? 'Adjustment note voided' : 'Adjustment note unvoided').success().send();
                })
                .successRedirectUrl(() => AdjustmentNoteResource.getUrl('index')),
            DeleteAction.make(),
        ];
    }
}
