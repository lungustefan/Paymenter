import { DebugLog } from '@/server/models/DebugLog';
import { EmailLog } from '@/server/models/EmailLog';
import { FailedJob } from '@/server/models/FailedJob';
import { setting } from '@/server/config';
import { retryFailedJob } from '@/server/queue';
import { Resource } from '../core/Resource';
import { Schema } from '../forms';
import { TextEntry, ViewEntry, View } from '../infolists';
import { Table } from '../tables/Table';
import { TextColumn } from '../tables/columns/TextColumn';
import { Action, BulkAction, BulkActionGroup } from '../actions/Action';
import { DeleteBulkAction, ViewAction } from '../actions/builtin';
import { ListRecords } from '../pages/resource/ListRecords';
import { ViewRecord } from '../pages/resource/ViewRecord';
import { Notification } from '../Notification';
import { hasPermission } from '@/server/policies';
import { currentDb } from '@/server/orm/context';
import { sql } from 'drizzle-orm';
import { Carbon } from '@/server/lib/carbon';
import type { User } from '@/server/models/User';

const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const emailStatusColor = ({ record }: { record?: any }) => ({ pending: 'gray', sent: 'success', failed: 'danger' })[record.status as 'pending'];

/* ---------------------------------------------------------------------------------------------
 * Email logs
 * ------------------------------------------------------------------------------------------- */

export class EmailLogResource extends Resource {
    static model = EmailLog;
    static slug = 'email-logs';
    static navigationIcon = 'ri-mail-send-line';
    static activeNavigationIcon = 'ri-mail-send-fill';
    static navigationGroup = 'Other';

    static override infolist(schema: Schema) {
        return schema.components([
            TextEntry.make('subject').size('md').label('Subject'),
            TextEntry.make('to').size('md').label('To'),
            TextEntry.make('sent_at').size('md').date().hidden(({ state }) => state === null).label('Sent At'),
            TextEntry.make('status')
                .badge()
                .color(emailStatusColor as any)
                .formatStateUsing(({ state }) => ucfirst(String(state)))
                .label('Status'),
            TextEntry.make('error').columnSpanFull().size('md').hidden(({ state }) => state === null).label('Error'),
            View.make()
                .columnSpanFull()
                .view(({ record }) => <iframe srcDoc={record.body} style={{ width: '100%', height: '700px', border: 'none' }} />),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('subject').searchable(),
                TextColumn.make('to').searchable(),
                TextColumn.make('sent_at').dateTime().sortable(),
                TextColumn.make('status')
                    .badge()
                    .color(emailStatusColor as any)
                    .formatStateUsing(({ state }) => ucfirst(String(state)))
                    .searchable(),
            ])
            .defaultSort((q) => q.orderBy('id', 'desc'))
            .filters([])
            .recordActions([ViewAction.make()]);
    }

    static override getPages() {
        return { index: ListEmailLogs.route('/'), view: ViewEmailLog.route('/{record}') };
    }
}
class ListEmailLogs extends ListRecords {
    static override resource = EmailLogResource;
}
class ViewEmailLog extends ViewRecord {
    static override resource = EmailLogResource;
}

/* ---------------------------------------------------------------------------------------------
 * HTTP / error logs (the debug_logs table)
 * ------------------------------------------------------------------------------------------- */

const ctx = (key: string) => ({ record }: { record?: any }) => record.context?.[key] ?? null;
const debugAccess = (user: User | null) => hasPermission(user, 'admin.debug_logs.view');

const jsonView = ({ entry, state }: { entry: any; state: any }) => (
    <div className="fi-in-entry-wrp">
        <div className="grid gap-y-2">
            <div className="flex items-center gap-x-3 justify-between">
                <dt className="fi-in-entry-wrp-label inline-flex items-center gap-x-3">
                    <span className="text-sm font-medium leading-6 text-gray-950 dark:text-white">{entry.__label}</span>
                </dt>
            </div>
            <pre style={{ overflowX: 'auto' }}>
                <code>{phpJsonPretty(state)}</code>
            </pre>
        </div>
    </div>
);

/** `json_encode($value, JSON_PRETTY_PRINT)` (4 spaces, escaped slashes) */
export function phpJsonPretty(value: unknown): string {
    return JSON.stringify(value ?? null, null, 4).replace(/\//g, '\\/');
}

function jsonEntry(name: string, label: string, key: string) {
    const entry = ViewEntry.make(name).label(label).state(ctx(key)).columnSpanFull();
    return entry.view((c) => jsonView({ entry: { __label: label }, state: c.state }));
}

export class HttpLogResource extends Resource {
    static model = DebugLog;
    static slug = 'http-logs';
    static navigationIcon = 'ri-external-link-line';
    static modelLabel = 'HTTP log';
    static navigationGroup = 'Debug';

    static override getEloquentQuery() {
        return super.getEloquentQuery().where('type', 'http');
    }
    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('method').state(ctx('method')).toggleable(),
                TextColumn.make('url').state(ctx('url')).searchable(undefined, ({ query, search }) => query.where('context->url', 'like', `%${search}%`)).toggleable(),
                TextColumn.make('status').state(ctx('response_status')).searchable(undefined, ({ query, search }) => query.where('context->response_status', 'like', `%${search}%`)).toggleable(),
                TextColumn.make('created_at').searchable().toggleable(true, true).sortable(),
            ])
            .recordActions([ViewAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])])
            .defaultSort('created_at', 'desc');
    }
    static override shouldRegisterNavigation() {
        return !!setting('debug', false);
    }
    static override infolist(schema: Schema) {
        return schema.components([
            TextEntry.make('method').state(ctx('method')),
            TextEntry.make('url').state(ctx('url')),
            TextEntry.make('status').state(ctx('response_status')),
            jsonEntry('request', 'Request', 'payload'),
            jsonEntry('request_headers', 'Request Headers', 'headers'),
            jsonEntry('response_headers', 'Response Headers', 'response_headers'),
            jsonEntry('response', 'Response', 'response'),
        ]);
    }
    static override getPages() {
        return { index: ListHttpLogs.route('/') };
    }
    static override canAccess(user: User | null) {
        return debugAccess(user);
    }
}
class ListHttpLogs extends ListRecords {
    static override resource = HttpLogResource;
}

export class ErrorLogResource extends Resource {
    static model = DebugLog;
    static slug = 'error-logs';
    static navigationIcon = 'ri-bug-line';
    static modelLabel = 'Error log';
    static navigationGroup = 'Debug';

    static override getEloquentQuery() {
        return super.getEloquentQuery().where('type', 'exception');
    }
    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('message').state(ctx('message')).toggleable(),
                TextColumn.make('file').state(ctx('file')).toggleable(),
                TextColumn.make('line').state(ctx('line')).toggleable(),
                TextColumn.make('created_at').searchable().toggleable(true, true).sortable(),
            ])
            .recordActions([ViewAction.make()])
            .toolbarActions([DeleteBulkAction.make()])
            .defaultSort('created_at', 'desc');
    }
    static override shouldRegisterNavigation() {
        return !!setting('debug', false);
    }
    static override infolist(schema: Schema) {
        return schema.columns(1).components([TextEntry.make('message').state(ctx('message')), TextEntry.make('file').state(ctx('file')), TextEntry.make('line').state(ctx('line')), TextEntry.make('trace').label('Trace').state(ctx('trace'))]);
    }
    static override getPages() {
        return { index: ListErrorLogs.route('/') };
    }
    static override canAccess(user: User | null) {
        return debugAccess(user);
    }
}
class ListErrorLogs extends ListRecords {
    static override resource = ErrorLogResource;
}

/* ---------------------------------------------------------------------------------------------
 * Failed jobs
 * ------------------------------------------------------------------------------------------- */

export class FailedJobResource extends Resource {
    static model = FailedJob;
    static slug = 'failed-jobs';
    static navigationIcon = 'ri-error-warning-line';
    static activeNavigationIcon = 'ri-error-warning-fill';
    static navigationGroup = 'Other';

    static override async getNavigationBadge() {
        const count = await FailedJob.count();
        return count ? String(count) : null;
    }
    static override getNavigationBadgeColor() {
        return 'danger';
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('uuid').toggleable(true, true),
                TextColumn.make('payload').formatStateUsing(({ state }) => {
                    try {
                        return JSON.parse(state as string).displayName;
                    } catch {
                        return null;
                    }
                }),
                TextColumn.make('exception')
                    .formatStateUsing(({ state }) => String(state ?? '').split('\n')[0])
                    .wrap()
                    .tooltip(({ state }) => state as string)
                    .limit(200),
                TextColumn.make('failed_at'),
            ])
            .poll()
            .recordActions([
                Action.make('retry')
                    .label('Retry')
                    .requiresConfirmation()
                    .action(async ({ record }) => {
                        await retryFailedJob(record.uuid);
                        await Notification.make().title(`The job with uuid '${record.uuid}' has been pushed back onto the queue.`).success().send();
                    }),
                Action.make('delete')
                    .label('Mark as Resolved')
                    .requiresConfirmation()
                    .color('danger')
                    .action(async ({ record }) => {
                        await record.delete();
                    }),
            ])
            .toolbarActions([
                BulkAction.make('retry')
                    .label('Retry')
                    .requiresConfirmation()
                    .action(async ({ records }) => {
                        for (const record of records ?? []) {
                            try {
                                await retryFailedJob((record as any).uuid);
                            } catch (e: any) {
                                console.error(e);
                                await Notification.make().title(e.message).warning().send();
                            }
                        }
                        await Notification.make().title(`${records?.length ?? 0} jobs have been pushed back onto the queue.`).success().send();
                    })
                    .deselectRecordsAfterCompletion(),
                BulkAction.make('delete')
                    .label('Mark as Resolved')
                    .requiresConfirmation()
                    .color('danger')
                    .action(async ({ records }) => {
                        for (const record of records ?? []) await (record as any).delete();
                        await Notification.make().title(`${records?.length ?? 0} jobs have been marked as resolved.`).success().send();
                    })
                    .deselectRecordsAfterCompletion(),
            ])
            .defaultSort('failed_at', 'desc');
    }

    static override canCreate() {
        return Promise.resolve(false);
    }

    static override getPages() {
        return { index: ListFailedJobs.route('/') };
    }
}
class ListFailedJobs extends ListRecords {
    static override resource = FailedJobResource;

    // warns when the queue is not being processed
    override async mount() {
        const [rows] = (await (currentDb() as any).execute(sql`select count(*) as c, min(available_at) as first from jobs`)) as any;
        const count = Number(rows[0]?.c ?? 0);
        if (count > 0) {
            const firstAvailable = Carbon.createFromTimestamp(Number(rows[0].first));
            if (Math.abs(firstAvailable.diffInMinutes(Carbon.now())) > 5) {
                await Notification.make()
                    .title('Whoops!')
                    .body(`There are ${count} jobs in the queue.\nThis could mean that your jobs are not being processed correctly.`)
                    .danger()
                    .actions([{ label: 'Browse Documentation', url: 'https://paymenter.org/docs/installation/install#creating-cronjob-and-service', openInNewTab: true }])
                    .send();
            }
        }
        await super.mount();
    }
}
