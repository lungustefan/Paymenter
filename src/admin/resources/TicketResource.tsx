import { Ticket } from '@/server/models/Ticket';
import { User } from '@/server/models/User';
import { setting } from '@/server/config';
import { ucfirst } from '@/server/lib/php';
import type { ReactNode } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { mimeFor } from '@/server/storage';
import { Resource } from '../core/Resource';
import { Schema, MarkdownEditor, FileUpload, Select, TextInput, Actions } from '../forms';
import { UserComponent } from '../components/UserComponent';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { SelectFilter } from '../tables/filters';
import { Action, BulkActionGroup, findByName } from '../actions/Action';
import { CreateAction, DeleteBulkAction, EditAction } from '../actions/builtin';
import { TextEntry } from '../infolists';
import { AuditAction } from '../actions/AuditAction';
import { Notification } from '../Notification';
import { trans } from '../context';
import { can } from '@/server/policies';
import { markdown } from '@/server/markdown';
import { route } from '@/server/routes';
import { Carbon } from '@/server/lib/carbon';
import { TicketMessage } from '@/server/models/TicketMessage';
import { Icon } from '../ui/Icon';
import { WidgetPoll } from '../widgets/client';
import { EditRecord } from '../pages/resource/EditRecord';
import { SchemaSlot, FormProvider } from '../forms/runtime';
import { FormSubmitButton } from '../forms/FormActions';
import { fillForm, makeRenderContext, normalizeInput, validateForm } from '../forms/process';
import { renderActionItem } from '../actions/render';
import { buttonClass } from '../ui/classes';
import { DeleteMessageButton, MailLogModal, MessageBox } from './ticket-client';
import { UserResource } from './UserResource';
import { ServiceResource } from './ServiceResource';
import type { AdminActionResult } from '../protocol';
import type { Host, ActionRef } from '../core/host';
import { CreateRecord } from '../pages/resource/CreateRecord';
import { ListRecords, ListTab } from '../pages/resource/ListRecords';
import { TicketsOverView } from '../widgets/PanelWidgets';

/** `array_combine(config('settings.ticket_departments'), config('settings.ticket_departments'))` */
export const departments = () => {
    const list = Object.values((setting<any>('ticket_departments', []) ?? {}) as Record<string, string>);
    return Object.fromEntries(list.map((d) => [d, d]));
};

/** `columnSpan(fn ($record) => $record ? 2 : 1)` */
const span = ({ record }: any) => (record ? 2 : 1);

export class TicketResource extends Resource {
    static model = Ticket;
    static slug = 'tickets';
    static navigationIcon = 'ri-customer-service-line';
    static activeNavigationIcon = 'ri-customer-service-fill';
    static navigationGroup = 'Administration';

    static override async getNavigationBadge() {
        const count = await Ticket.query().where('status', 'open').count();
        return count ? String(count) : null;
    }
    static override getNavigationBadgeColor() {
        return 'danger';
    }

    static override form(schema: Schema) {
        return schema.components([
            TextInput.make('subject').label('Subject').columnSpan(span).required(),
            Select.make('status')
                .label('Status')
                .options({ open: 'Open', closed: 'Closed', replied: 'Replied' })
                .columnSpan(span)
                .default('open')
                .required(),
            Select.make('priority')
                .label('Priority')
                .options({ low: 'Low', medium: 'Medium', high: 'High' })
                .columnSpan(span)
                .default('medium')
                .required(),
            Select.make('department').label('Department').options(() => departments()).columnSpan(span),
            UserComponent.make('user_id').columnSpan(span),
            Select.make('assigned_to')
                .label('Assigned To')
                .searchable()
                .preload()
                .relationship('user', 'id', (q) => void q.whereNotNull('role_id'))
                .getOptionLabelFromRecordUsing((record: any) => record.displayName())
                .columnSpan(span),
            Select.make('service_id')
                .label('Service')
                .relationship('service', 'id', (q, _search, { get }) => void q.where('user_id', get('user_id')))
                .getOptionLabelFromRecordUsing(async (record: any) => `${(await (await record.rel('product')))?.name} - ${ucfirst(record.status)}`)
                .columnSpan(span)
                .disabled(({ get }) => !get('user_id')),
            MarkdownEditor.make('message').columnSpan(2).label('Initial Message').hiddenOn('edit').columnSpan(span).required(),
        ]);
    }

    static override table(table: Table) {
        const status = ({ record }: any) => ({ open: 'success', closed: 'danger', replied: 'warning' })[record.status as string] ?? null;
        const priority = ({ record }: any) => ({ low: 'success', medium: 'gray', high: 'danger' })[record.priority as string] ?? null;
        return table
            .columns([
                TextColumn.make('id').label('ID').sortable(),
                TextColumn.make('subject').searchable().sortable(),
                TextColumn.make('status').sortable().badge().color(status).formatStateUsing(({ state }) => ucfirst(String(state))),
                TextColumn.make('priority').sortable().badge().color(priority).formatStateUsing(({ state }) => ucfirst(String(state))),
                TextColumn.make('department').sortable(),
                TextColumn.make('user.name').searchable(['first_name', 'last_name']).sortable(['first_name', 'last_name']),
            ])
            .filters([
                SelectFilter.make('user')
                    .label('User')
                    .relationship('user', 'id')
                    .indicateUsing(async ({ data }: any) => (data.value ? `User: ${(await User.find(data.value))?.displayName()}` : null))
                    .getOptionLabelFromRecordUsing((record: any) => record.displayName()),
                SelectFilter.make('priority').options({ low: 'Low', medium: 'Medium', high: 'High' }),
                SelectFilter.make('department').options(() => departments()),
                SelectFilter.make('assigned_to')
                    .label('Assigned To')
                    .relationship('user', 'id', (q) => void q.whereNotNull('role_id'))
                    .indicateUsing(async ({ data }: any) => (data.value ? `Assigned to: ${(await User.find(data.value))?.displayName()}` : null))
                    .getOptionLabelFromRecordUsing((record: any) => record.displayName()),
            ])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])])
            .defaultSort('id', 'desc');
    }

    static override getWidgets() {
        return [TicketsOverView];
    }

    static override getPages() {
        return { index: ListTickets.route('/'), create: CreateTicket.route('/create'), edit: EditTicket.route('/{record}/edit') };
    }
}

class CreateTicket extends CreateRecord {
    static override resource = TicketResource;

    protected override async handleRecordCreation(data: Record<string, any>) {
        const record = new Ticket();
        record.fill(data);
        await record.save();
        await record.relation('messages').create({ user_id: this.user.id, message: data.message });
        return record;
    }
}

class ListTickets extends ListRecords {
    static override resource = TicketResource;

    override getHeaderActions() {
        return [CreateAction.make()];
    }
    override getHeaderWidgets() {
        return [TicketsOverView];
    }
    override getTabs() {
        return {
            all: ListTab.make('All Tickets').icon('heroicon-m-user-group'),
            open: ListTab.make('Open Tickets').icon('heroicon-o-lock-open').modifyQueryUsing((q) => void q.where('status', 'open')),
            replied: ListTab.make('Replied Tickets').icon('heroicon-o-chat-bubble-left-right').modifyQueryUsing((q) => void q.where('status', 'replied')),
            closed: ListTab.make('Closed Tickets').icon('heroicon-o-lock-closed').modifyQueryUsing((q) => void q.where('status', 'closed')),
        };
    }
    override getDefaultActiveTab() {
        return 'open';
    }
}


const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const statusColor = ({ state }: any) => ({ open: 'success', closed: 'danger', replied: 'gray' })[state as string] ?? null;
const priorityColor = ({ state }: any) => ({ low: 'success', medium: 'gray', high: 'danger' })[state as string] ?? null;

/** `admin.resources.ticket-resource.pages.edit-ticket` */
class EditTicket extends EditRecord {
    static override resource = TicketResource;

    override getHeaderActions() {
        return [];
    }

    protected override makeSchema(): Schema {
        return Schema.make()
            .operation('edit')
            .model(this.record!)
            .columns(1)
            .components([
                MarkdownEditor.make('message')
                    .label('Message')
                    .toolbarButtons([['bold', 'italic', 'strike', 'link'], ['heading'], ['blockquote', 'codeBlock', 'bulletList', 'orderedList'], ['table'], ['undo', 'redo']])
                    .required(({ get }) => (get('attachments') ?? []).length === 0),
                FileUpload.make('attachments').label('Attachments').visibility('private').directory('tickets/uploads').multiple().storeFileNamesIn('attachment_names').reorderable(),
            ]);
    }

    /** `closeTicket()` */
    private closeAction?: Action;
    closeTicket() {
        return (this.closeAction ??= Action.make('closeTicket')
            .label(trans('ticket.close_ticket'))
            .color('danger')
            .hidden(async () => !(await can(this.user, 'update', this.record)) || this.record.status === 'closed')
            .action(async ({ record }: any) => void (await record.update({ status: 'closed' })))
            .after(async () => {
                await this.record.refresh();
                await Notification.make().title('Ticket closed successfully.').success().send();
            }));
    }

    /** `infolist()` */
    private infolistSchema?: Schema;
    infolist(): Schema {
        if (this.infolistSchema) return this.infolistSchema;
        const record = this.record;
        const actions = Actions.make([
            Action.make('Edit')
                .schema(() =>
                    Schema.make()
                        .columns(2)
                        .components([
                            Select.make('status').label('Status').options({ open: 'Open', closed: 'Closed', replied: 'Replied' }).default('open').required(),
                            Select.make('priority').label('Priority').options({ low: 'Low', medium: 'Medium', high: 'High' }).default('medium').required(),
                            Select.make('department').label('Department').options(() => departments()),
                            UserComponent.make('user_id'),
                            Select.make('assigned_to')
                                .label('Assigned To')
                                .relationship('assignedTo', 'id', (q) => void q.whereNotNull('role_id'))
                                .searchable()
                                .preload()
                                .getOptionLabelFromRecordUsing((r: any) => r.displayName()),
                            Select.make('service_id')
                                .label('Service')
                                .relationship('service', 'id', (q, _search, { get }) => void q.where('user_id', get('user_id')))
                                .getOptionLabelFromRecordUsing(async (r: any) => `${(await r.rel('product'))?.name} - ${ucfirst(r.status)}`)
                                .disabled(({ get }) => !get('user_id')),
                        ]),
                )
                .fillForm(({ record }: any) => ({ status: record.status, priority: record.priority, department: record.department, user_id: record.user_id, assigned_to: record.assigned_to, service_id: record.service_id }))
                .action(async ({ data, record }: any) => void (await record.update(data)))
                .hidden(async () => !(await can(this.user, 'update', record)))
                .icon('heroicon-o-pencil'),
            Action.make('Delete')
                .color('danger')
                .icon('heroicon-o-trash')
                .requiresConfirmation()
                .action(async ({ record }: any) => void (await record.delete()))
                .hidden(async () => !(await can(this.user, 'delete', record)))
                .after(async () => {
                    await Notification.make().title(trans('filament-actions::delete.single.notifications.deleted.title')).success().send();
                })
                .successRedirectUrl(() => TicketResource.getUrl('index')),
            AuditAction.make().auditChildren(['messages']),
        ]).columnSpan({ default: 'full', md: 1 });
        actions.actionPrefix = 'infolist';
        const user = async (r: any) => (await r.rel('user'))?.displayName();
        this.infolistSchema = Schema.make()
            .model(record)
            .columns({ default: 3, md: 1 })
            .components([
                TextEntry.make('user_id')
                    .size('lg')
                    .formatStateUsing(async ({ record }: any) => user(record))
                    .url(async ({ record }: any) => UserResource.getUrl('edit', { record: await record.rel('user') }))
                    .label('User ID'),
                TextEntry.make('subject').size('lg').label('Subject'),
                TextEntry.make('status').size('lg').badge().formatStateUsing(({ state }) => ucfirst(state)).color(statusColor).label('Status'),
                TextEntry.make('priority').size('lg').badge().formatStateUsing(({ state }) => ucfirst(state)).color(priorityColor).label('Priority'),
                TextEntry.make('department').size('lg').placeholder('No department').label('Department'),
                TextEntry.make('assigned_to')
                    .size('lg')
                    .label('Assigned To')
                    .placeholder('No assigned user')
                    .formatStateUsing(async ({ record }: any) => (await record.rel('assignedTo'))?.displayName()),
                TextEntry.make('service_id')
                    .size('lg')
                    .label('Service')
                    .url(async ({ record }: any) => (record.service_id ? ServiceResource.getUrl('edit', { record: await record.rel('service') }) : null))
                    .placeholder('No service')
                    .formatStateUsing(async ({ record }: any) => {
                        const service = await record.rel('service');
                        return `${(await service.rel('product'))?.name} - ${ucfirst(service.status)}`;
                    }),
                actions,
            ]);
        return this.infolistSchema;
    }

    override getForm(_id: string, state?: Record<string, any>) {
        return Promise.resolve({ schema: this.makeSchema(), rc: this.makeRc(state ? normalizeInput(state) : {}) });
    }

    override async findAction(id: string, state?: Record<string, any>): Promise<ActionRef | null> {
        if (id === 'page.closeTicket') {
            const action = this.closeTicket();
            return { action, ctx: this.actionContext({ action }) };
        }
        if (id.startsWith('infolist.')) {
            const actions = this.infolistSchema ?? this.infolist();
            const component = actions.getComponents().find((c: any) => c instanceof Actions) as Actions | undefined;
            const action = component?.findAction(id.slice('infolist.'.length));
            return action ? { action, ctx: this.actionContext({ action }) } : null;
        }
        return super.findAction(id, state);
    }

    /** `send()` */
    override async submitForm(_id: string, input: Record<string, any>): Promise<AdminActionResult> {
        const schema = this.makeSchema();
        const rc = this.makeRc(normalizeInput(input));
        const errors = await validateForm(schema, rc);
        if (errors) return { ok: false, errors };
        const state = rc.state;
        const message: any = await this.record.relation('messages').create({ user_id: this.user.id, message: state.message ?? '' });
        // move attachments
        for (const attachment of (state.attachments ?? []) as string[]) {
            const original = path.join(process.cwd(), 'storage', 'app', attachment);
            await message.relation('attachments').create({
                path: attachment,
                filename: (state.attachment_names ?? {})[attachment] ?? path.basename(attachment),
                mime_type: mimeFor(original),
                filesize: fs.statSync(original).size,
            });
        }
        return { ok: true, refresh: true, state: await fillForm(schema, this.makeRc(), {}) };
    }

    /** `deleteMessage(TicketMessage $message)` */
    override async callMethod(method: string, args: any[]): Promise<AdminActionResult> {
        if (method !== 'deleteMessage') return { ok: false };
        const message = await TicketMessage.query().where('id', args[0]).first();
        if (message && (await can(this.user, 'delete', message))) await message.delete();
        return { ok: true, refresh: true };
    }

    private async renderMessages(): Promise<ReactNode> {
        const messages = (await this.record.relation('messages').with(['user', 'ticketMailLog', 'attachments']).get()) as any[];
        const out: ReactNode[] = [];
        for (const [index, message] of messages.entries()) {
            const owner = await message.rel('user');
            const mailLog = await message.rel('ticketMailLog');
            const attachments = (await message.rel('attachments')) as any[];
            const mine = message.user_id === this.record.user_id;
            out.push(
                <MessageBox key={message.id} last={index === messages.length - 1} className={`border border-gray-100 dark:border-gray-600 p-4 rounded-lg w-full max-w-[80%]  ${mine ? 'ml-auto' : 'mr-auto'}`}>
                    <div className="flex justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <img alt={`Avatar of ${owner.displayName()}`} className="fi-avatar fi-circular fi-size-md fi-user-avatar size-7 shrink-0 rounded-full block" src={owner.avatarUrl()} />
                            <div className="flex flex-col">
                                <div className="flex gap-3 items-center">
                                    <a className="text-lg font-semibold hover:underline" href={UserResource.getUrl('edit', { record: owner })}>
                                        {owner.displayName()}
                                    </a>
                                </div>
                                <div className="flex gap-1">
                                    <p className="text-sm text-gray-500">{Carbon.parse(message.created_at).diffForHumans()}</p>
                                    {mailLog && (
                                        <MailLogModal
                                            heading={mailLog.subject}
                                            trigger={<span className="text-sm text-gray-500 cursor-pointer hover:underline">— Imported from email </span>}
                                        >
                                            <div dangerouslySetInnerHTML={{ __html: markdown(escapeHtml(mailLog.body ?? ''), { allow_unsafe_links: false, soft_break: '<br>' }) }} />
                                        </MailLogModal>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div>{(await can(this.user, 'delete', message)) && <DeleteMessageButton id={message.id}>Delete</DeleteMessageButton>}</div>
                    </div>
                    <div className="mt-2 prose dark:prose-invert break-words overflow-x-auto max-w-full" dangerouslySetInnerHTML={{ __html: markdown(message.message, { html_input: 'escape', allow_unsafe_links: false, soft_break: '<br>' }) }} />
                    <div className="flex flex-wrap gap-x-2">
                        {attachments.map((attachment) => (
                            <div key={attachment.id} className="mt-2">
                                <a href={route('tickets.attachments.show', { attachment: attachment.uuid }, false)} className="text-sm rounded-md bg-gray-100 flex items-center dark:bg-gray-800 p-1 w-fit">
                                    {attachment.canPreview() ? (
                                        <img src={route('tickets.attachments.show', { attachment: attachment.uuid }, false)} alt={attachment.filename} className="max-w-full" />
                                    ) : (
                                        <>
                                            <Icon icon="ri-attachment-2" size={null} className="inline-block mr-1 size-4" />
                                            {attachment.filename}
                                        </>
                                    )}
                                </a>
                            </div>
                        ))}
                    </div>
                </MessageBox>,
            );
        }
        return out;
    }

    override async renderContent(): Promise<ReactNode> {
        const schema = this.makeSchema();
        const rc = this.makeRc();
        const state = await fillForm(schema, rc, {});
        const node = await schema.render(rc);
        const info = this.infolist();
        const infoRc = makeRenderContext({ state: {}, operation: 'view', record: this.record, model: this.getModel(), user: this.user, livewire: this, formId: 'infolist' });
        infoRc.extra.disabledSchema = true;
        const closeAction = this.closeTicket();
        const closeCtx = this.actionContext({ action: closeAction });
        return (
            <div className="md:grid grid-cols-4 flex flex-col gap-4">
                <WidgetPoll interval="10s" />
                <div className="md:col-span-3">
                    <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-4">{await this.renderMessages()}</div>
                    <FormProvider formId="form" initialState={state} schema={node} target={{ kind: 'form', id: 'form' }} className="">
                        <div className="mt-4 mb-4">
                            <SchemaSlot />
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                            {(await closeAction.isVisible(closeCtx)) && (await renderActionItem(closeAction, closeCtx, 'page.closeTicket'))}
                            <FormSubmitButton className={buttonClass({ color: 'primary', size: 'md' })}>Send Message</FormSubmitButton>
                        </div>
                    </FormProvider>
                </div>
                <div className="md:order-last order-first w-full col-span-3 sm:col-auto">{await info.render(infoRc)}</div>
            </div>
        );
    }
}
