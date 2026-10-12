import { Audit } from '@/server/models/Audit';
import { Resource } from '../core/Resource';
import { Schema } from '../forms';
import { TextEntry, ViewEntry } from '../infolists';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { BulkActionGroup } from '../actions/Action';
import { DeleteBulkAction, ViewAction } from '../actions/builtin';
import { ListRecords } from '../pages/resource/ListRecords';
import { ViewRecord } from '../pages/resource/ViewRecord';
import { getModified } from '../actions/AuditAction';
import { CategoryResource } from './CategoryResource';
import { InvoiceResource } from './InvoiceResource';
import { OrderResource } from './OrderResource';
import { ProductResource } from './ProductResource';
import { ServiceResource } from './ServiceResource';
import { TaxRateResource } from './TaxRateResource';
import { TicketResource } from './TicketResource';
import { UserResource } from './UserResource';

const classBasename = (type: string) => type.split('\\').pop() ?? type;
const TYPE_TO_RESOURCE = (): Record<string, typeof Resource> => ({ User: UserResource, Product: ProductResource, Order: OrderResource, Invoice: InvoiceResource, Category: CategoryResource, Service: ServiceResource, TaxRate: TaxRateResource, Ticket: TicketResource });

/** PHP `empty()` */
const phpEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === false || v === 0 || v === '0' || (Array.isArray(v) && v.length === 0);
const show = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

const userName = async ({ record }: any) => {
    const user = await record.rel('user');
    return user ? user.displayName() : `User #${record.user_id}`;
};
const eventLabel = ({ record }: any) => `${record.event} - ${classBasename(record.auditable_type)} (${record.auditable_id})`;
const eventUrl = ({ record }: any) => {
    const resource = TYPE_TO_RESOURCE()[classBasename(record.auditable_type)];
    return record.event !== 'deleted' && resource ? resource.getUrl('edit', { record: record.auditable_id }) : null;
};
const userUrl = ({ record }: any) => (record.user_id ? UserResource.getUrl('edit', { record: record.user_id }) : '');

/** `admin.infolists.components.difference` */
function Difference({ record, label }: { record: Audit; label: string }) {
    const modified = getModified(record);
    const keys = Object.keys(modified);
    const created = record.event === 'created';
    return (
        <div className="fi-in-entry-wrp">
            <div className="grid gap-y-2">
                <div className="flex items-center gap-x-3 justify-between">
                    <dt className="fi-in-entry-wrp-label inline-flex items-center gap-x-3">
                        <span className="text-sm font-medium leading-6 text-gray-950 dark:text-white">{label}</span>
                    </dt>
                </div>
                <div className="flex-grow space-y-1">
                    <div className="text-sm text-gray-950 dark:text-white">
                        {keys.length === 0 ? (
                            <span className="text-xs text-gray-950 dark:text-white">No changes</span>
                        ) : (
                            keys.map((key) => {
                                const value = modified[key];
                                if (created ? phpEmpty(value.new) : phpEmpty(value.new) && phpEmpty(value.old)) return null;
                                return (
                                    <div key={key} className="bg-background-secondary rounded">
                                        <div className="flex flex-wrap items-center gap-x-2">
                                            {created ? (
                                                <>
                                                    <span className="font-semibold">{key}</span>
                                                    <p className="text-green-300 p-1 rounded font-mono">{show(value.new)}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="font-semibold">{key}</span> changed from
                                                    <p className="text-red-300 p-1 rounded font-mono">{show(value.old)}</p>
                                                    <p className="font-medium">-&gt;</p>
                                                    <p className="text-green-300 p-1 rounded font-mono">{show(value.new)}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export class AuditResource extends Resource {
    static model = Audit;
    static slug = 'audits';
    static navigationIcon = 'ri-file-copy-2-line';
    static activeNavigationIcon = 'ri-file-copy-2-fill';
    static navigationGroup = 'System';

    static override infolist(schema: Schema) {
        return schema.components([
            TextEntry.make('user_id').url(userUrl).formatStateUsing(userName).placeholder('System'),
            TextEntry.make('event').formatStateUsing(eventLabel).url(eventUrl),
            TextEntry.make('user_agent'),
            TextEntry.make('ip_address'),
            TextEntry.make('url'),
            TextEntry.make('created_at').dateTime(),
            ViewEntry.make('changes')
                .label('Changes')
                .columnSpanFull()
                .view(({ record }) => <Difference record={record} label="Changes" />),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('user_id').url(userUrl).formatStateUsing(userName).placeholder('System').sortable(),
                TextColumn.make('event')
                    .formatStateUsing(eventLabel)
                    .url(eventUrl)
                    .searchable(true, ({ query, search }) => {
                        query.where((w) => void w.where('event', 'like', `%${search}%`).orWhere('auditable_type', 'like', `%${search}%`).orWhere('auditable_id', 'like', `%${search}%`));
                    }),
                TextColumn.make('ip_address').searchable(),
                TextColumn.make('user_agent').toggleable(true, true).searchable(),
                TextColumn.make('created_at').dateTime().sortable().toggleable(true, true),
                TextColumn.make('updated_at').dateTime().sortable().toggleable(true, true),
            ])
            .filters([])
            .recordActions([ViewAction.make()])
            .defaultSort((q) => q.orderBy('created_at', 'desc').orderBy('id', 'desc'))
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getPages() {
        return { index: ListAudits.route('/'), view: ViewAudit.route('/{record}') };
    }
}
class ListAudits extends ListRecords {
    static override resource = AuditResource;
}
class ViewAudit extends ViewRecord {
    static override resource = AuditResource;
}
