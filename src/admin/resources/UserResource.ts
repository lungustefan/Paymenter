import { User } from '@/server/models/User';
import { Currency } from '@/server/models/Currency';
import { Ticket } from '@/server/models/Ticket';
import { hashPassword } from '@/server/lib/crypto';
import { Carbon } from '@/server/lib/carbon';
import { sessionPut } from '@/server/session';
import { Resource } from '../core/Resource';
import { Schema, Select, TextInput, Toggle } from '../forms';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { TextInputColumn } from '../tables/columns/ToggleColumn';
import { Filter, SelectFilter } from '../tables/filters';
import { Action } from '../actions/Action';
import { CreateAction, DeleteAction, EditAction, ViewAction } from '../actions/builtin';
import { AuditAction } from '../actions/AuditAction';
import { dbValue } from '../core/attributes';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { EditRecord } from '../pages/resource/EditRecord';
import { ListRecords } from '../pages/resource/ListRecords';
import { ManageRelatedRecords } from '../pages/resource/ManageRelatedRecords';
import { PropertiesRelationManager } from './PropertiesRelationManager';
import { GatewayResource } from './ExtensionResources';
import { InvoiceResource } from './InvoiceResource';
import { ServiceResource } from './ServiceResource';

const canUpdateRoles = async ({ user }: { user: User }) => !!user && (await user.hasPermission('admin.roles.update'));

export class UserResource extends Resource {
    static model = User;
    static override getGloballySearchableAttributes() {
        return ['first_name', 'last_name', 'email'];
    }
    static override getGlobalSearchResultTitle(record: any) {
        return record.displayName();
    }
    static slug = 'users';
    static navigationGroup = 'Administration';
    static navigationIcon = 'ri-group-line';
    static activeNavigationIcon = 'ri-group-fill';
    static globallySearchableAttributes = ['first_name', 'last_name', 'email'];

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('first_name').translateLabel().required(),
            TextInput.make('last_name').translateLabel().required(),
            TextInput.make('email').translateLabel().email().required().unique('users', 'email', null, true),

            TextInput.make('password')
                .translateLabel()
                .password()
                .revealable()
                .dehydrateStateUsing(({ state }) => hashPassword(String(state)))
                .dehydrated(({ state }) => state !== null && state !== undefined && String(state).trim() !== '')
                .required(({ operation }) => operation === 'create'),
            Select.make('role_id')
                .translateLabel()
                .relationship('role', 'name')
                .searchable()
                .preload()
                .hidden(async (ctx) => !(await canUpdateRoles(ctx as any)))
                .disabled(async (ctx) => !(await canUpdateRoles(ctx as any))),
            Toggle.make('tfa_secret')
                .label('Two Factor Authentication')
                .disabled(({ record }) => !record?.tfa_secret)
                .dehydrateStateUsing(({ state, record }) => (state ? record.tfa_secret : null))
                .formatStateUsing(({ record }) => !!(record && record.tfa_secret))
                .hiddenOn(['create']),

            Toggle.make('email_verified_at')
                .label('Email Verified')
                .dehydrateStateUsing(({ state, record }) => {
                    if (state && !record.email_verified_at) return Carbon.now();
                    return state ? record.email_verified_at : null;
                })
                .hiddenOn(['create']),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('first_name')
                    .searchable()
                    .sortable()
                    .description(async ({ record }) => {
                        const credits = (await record.rel('credits')) as any[];
                        if (credits.length <= 0) return null;
                        return `Earnings - ${credits.map((c) => `${c.currency_code}: ${dbValue(c, 'amount', c.amount)}`).join(', ')}`;
                    }),
                TextColumn.make('last_name').searchable().sortable(),
                TextColumn.make('email').searchable().sortable(),
                TextColumn.make('role.name').sortable(),
                TextColumn.make('created_at').dateTime().sortable(),
            ])
            .filters([
                SelectFilter.make('role').relationship('role', 'name').searchable().preload(),
                Filter.make('email_verified').label('Email Verified'),
                Filter.make('has_active_services')
                    .label('Has Active Services')
                    .query(({ query }) => void query!.whereHas('services', (q) => q.where('status', 'active'))),
            ])
            .recordActions([EditAction.make()])
            .defaultSort('created_at', 'desc');
    }

    static override getRelations() {
        return [PropertiesRelationManager];
    }

    static override getPages() {
        return {
            index: ListUsers.route('/'),
            create: CreateUser.route('/create'),
            edit: EditUser.route('/{record}/edit'),
            services: ShowServices.route('/{record}/services'),
            invoices: ShowInvoices.route('/{record}/invoices'),
            credits: ShowCredits.route('/{record}/credits'),
            tickets: ShowTickets.route('/{record}/tickets'),
            'billing-agreements': ShowBillingAgreements.route('/{record}/billing-agreements'),
        };
    }

    static override async getRecordSubNavigation(page: any) {
        return page.generateNavigationItems([EditUser, ShowServices, ShowInvoices, ShowCredits, ShowTickets, ShowBillingAgreements]);
    }
}

class CreateUser extends CreateRecord {
    static override resource = UserResource;
}

class EditUser extends EditRecord {
    static override resource = UserResource;

    override getHeaderActions() {
        return [
            DeleteAction.make().hidden(({ user, record }) => user.id === record.id),
            Action.make('impersonate')
                .label('Impersonate')
                .action(async ({ record }) => {
                    await sessionPut('impersonating', record.id);
                })
                .successRedirectUrl(() => '/dashboard')
                .hidden(async ({ user, record }) => !(await user.hasPermission('admin.users.impersonate')) || user.id === record.id),
            AuditAction.make().auditChildren(['invoices', 'services', 'tickets', 'credits', 'orders', 'billingAgreements', 'properties']),
        ];
    }
}

class ListUsers extends ListRecords {
    static override resource = UserResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}

const upper = (s: unknown) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

class ShowBillingAgreements extends ManageRelatedRecords {
    static override resource = UserResource;
    static override relationship = 'billingAgreements';
    static override navigationIcon = 'ri-bank-card-line';
    static override getNavigationLabel() {
        return 'Billing Agreements';
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('name')
            .columns([
                TextColumn.make('name').label('Name'),
                TextColumn.make('external_reference').label('External Reference'),
                TextColumn.make('gateway.name')
                    .url(({ record }) => GatewayResource.getUrl('edit', { record: record.gateway_id }))
                    .label('Gateway'),
            ]);
    }
}

class ShowCredits extends ManageRelatedRecords {
    static override resource = UserResource;
    static override relationship = 'credits';
    static override navigationIcon = 'ri-coin-line';
    static override getNavigationLabel() {
        return 'Credits';
    }

    /** the currencies the user has no credit in yet */
    private async freeCurrencies() {
        const existing = ((await (this.ownerRecord as any).rel('credits')) as any[]).map((c) => c.currency_code);
        return ((await Currency.query().get()) as any[]).map((c) => c.code as string).filter((code) => !existing.includes(code));
    }

    override form(schema: Schema) {
        return schema.components([
            Select.make('currency_code')
                .options(async () => Object.fromEntries((await this.freeCurrencies()).map((code) => [code, code])))
                .live()
                .required(),
            TextInput.make('amount')
                .required()
                .label('Amount')
                // Suffix based on chosen currency
                .prefix(async ({ get }) => ((await Currency.query().where('code', get('currency_code')).first()) as any)?.prefix ?? null)
                .suffix(async ({ get }) => ((await Currency.query().where('code', get('currency_code')).first()) as any)?.suffix ?? null)
                .live(true)
                .moneyMask()
                .numeric()
                .minValue(0),
        ]);
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('currency.code')
            .columns([
                TextColumn.make('currency.code'),
                TextColumn.make('formattedAmount').label('Formatted Amount'),
                TextInputColumn.make('amount')
                    .label('Amount')
                    .disabled(async ({ user }) => !(await user.hasPermission('admin.credits.update'))),
            ])
            .filters([])
            .headerActions([CreateAction.make().disabled(async () => (await this.freeCurrencies()).length <= 0)])
            .recordActions([DeleteAction.make()]);
    }
}

class ShowInvoices extends ManageRelatedRecords {
    static override resource = UserResource;
    static override relationship = 'invoices';
    static override navigationIcon = 'ri-receipt-line';
    static override getNavigationLabel() {
        return 'Invoices';
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('product.name')
            .columns([
                TextColumn.make('id').sortable(),
                TextColumn.make('formattedTotal').label('Total'),
                TextColumn.make('status')
                    .label('Status')
                    // Make first letter uppercase
                    .formatStateUsing(({ state }) => upper(state))
                    .badge()
                    .color(({ state }) => ({ paid: 'success', pending: 'warning' })[state as string] ?? 'danger'),
            ])
            .filters([SelectFilter.make('status').label('Status').options({ paid: 'Paid', pending: 'Pending', cancelled: 'Cancelled' })])
            .recordActions([ViewAction.make().url(({ record }) => InvoiceResource.getUrl('edit', { record }))]);
    }
}

class ShowServices extends ManageRelatedRecords {
    static override resource = UserResource;
    static override relationship = 'services';
    static override navigationIcon = 'heroicon-o-shopping-cart';
    static override getNavigationLabel() {
        return 'Products/Services';
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('product.name')
            .columns([
                TextColumn.make('id').label('ID').sortable(),
                TextColumn.make('product.name'),
                TextColumn.make('quantity'),
                TextColumn.make('formattedPrice').label('Price'),
                TextColumn.make('status')
                    .badge()
                    .formatStateUsing(({ state }) => upper(state))
                    .color(({ state }) => ({ active: 'success', pending: 'warning', suspended: 'danger', cancelled: 'gray' })[state as string] ?? 'gray'),
            ])
            .filters([])
            .recordActions([ViewAction.make().url(({ record }) => ServiceResource.getUrl('edit', { record }))]);
    }
}

class ShowTickets extends ManageRelatedRecords {
    static override resource = UserResource;
    static override relationship = 'tickets';
    static override navigationIcon = 'ri-customer-service-line';
    static override getNavigationLabel() {
        return 'Tickets';
    }

    override table(table: Table) {
        return table
            .recordTitleAttribute('name')
            .columns([
                TextColumn.make('subject').searchable().sortable(),
                TextColumn.make('status')
                    .sortable()
                    .badge()
                    .color(({ record }) => ({ open: 'success', closed: 'danger', replied: 'warning' })[(record as Ticket).status as string] ?? null)
                    .formatStateUsing(({ state }) => upper(state)),
                TextColumn.make('priority')
                    .sortable()
                    .badge()
                    .color(({ record }) => ({ low: 'success', medium: 'gray', high: 'danger' })[(record as Ticket).priority as string] ?? null)
                    .formatStateUsing(({ state }) => upper(state)),
                TextColumn.make('department').sortable(),
                TextColumn.make('user.name').searchable(['first_name', 'last_name']).sortable(['first_name', 'last_name']),
            ]);
    }
}
