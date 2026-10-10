import { Action, type ActionContext } from './Action';
import { Audit } from '@/server/models/Audit';
import { Carbon } from '@/server/lib/carbon';
import { Icon } from '../ui/Icon';

/** `class_basename()` of a morph name */
const classBasename = (type: string) => type.split('\\').pop() ?? type;

/** owen-it `Audit::getModified()`: `{ attribute: { old, new } }` */
function getModified(audit: Audit) {
    const modified: Record<string, { old?: unknown; new?: unknown }> = {};
    for (const state of ['old', 'new'] as const) {
        const values = state === 'old' ? audit.oldValues : audit.newValues;
        for (const [key, value] of Object.entries(values)) (modified[key] ??= {})[state] = value;
    }
    return modified;
}

const show = (value: unknown) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** `admin/actions/audits.blade.php` */
async function AuditList({ record, children }: { record: any; children: string[] }) {
    const load = (m: any) => Audit.query().where('auditable_type', m.ctor.morphName).where('auditable_id', m.getKey()).orderBy('created_at', 'desc').get();
    let audits: Audit[] = await load(record);
    for (const child of children) for (const childRecord of await record.relation(child).get()) audits = audits.concat(await load(childRecord));
    // `sortByDesc('created_at')->sortByDesc('id')`: ends up ordered by id, newest first
    audits.sort((a, b) => Number(b.id) - Number(a.id));
    const users = new Map<string, any>();
    for (const audit of audits) {
        const k = `${audit.user_type}:${audit.user_id}`;
        if (audit.user_id && !users.has(k)) users.set(k, await audit.rel('user'));
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            {audits.map((audit) => {
                const modified = getModified(audit);
                const keys = Object.keys(modified);
                const newValues = audit.newValues as Record<string, any>;
                return (
                    <div key={String(audit.id)} className="fi-in-repeatable-item block rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-950/5 dark:bg-white/5 dark:ring-white/10">
                        <div className="flex gap-x-3">
                            <div className="flex-grow space-y-2 pt-[6px]">
                                <div className="flex gap-x-2 items-center justify-between">
                                    <div className="flex gap-x-2 items-center">
                                        <div className="text-sm font-medium text-gray-950 dark:text-white">
                                            {users.get(`${audit.user_type}:${audit.user_id}`)?.name ?? 'System'}{' '}
                                            {audit.event === 'extension_action' && newValues.action !== undefined ? String(newValues.action).replaceAll('_', ' ') : audit.event} {classBasename(audit.auditable_type)} (#{String(audit.auditable_id)})
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-950 dark:text-white text-nowrap">
                                        {audit.tags && audit.tags === 'admin' && (
                                            <span className="text-green-500" title="Action executed by admin">
                                                <Icon icon="ri-shield-user-line" size={null} className="inline-block size-4" />
                                            </span>
                                        )}{' '}
                                        {Carbon.parse(audit.created_at as any).format('Y-m-d H:i:s')}
                                    </div>
                                </div>
                                <div className="flex-grow space-y-1">
                                    {audit.event === 'created' ? (
                                        <div className="text-sm text-gray-950 dark:text-white">
                                            {keys.length === 0 ? (
                                                <span className="text-xs text-gray-950 dark:text-white">No changes</span>
                                            ) : (
                                                keys
                                                    .filter((key) => !isEmpty(modified[key].new))
                                                    .map((key) => (
                                                        <div key={key} className="bg-background-secondary rounded">
                                                            <div className="flex flex-wrap items-center gap-x-2">
                                                                <span className="font-semibold">{key}</span>
                                                                <p className="text-green-300 p-1 rounded font-mono">{show(modified[key].new)}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    ) : audit.event !== 'extension_action' ? (
                                        <div className="text-sm text-gray-950 dark:text-white">
                                            {keys.length === 0 ? (
                                                <span className="text-xs text-gray-950 dark:text-white">No changes</span>
                                            ) : (
                                                keys.map((key) => (
                                                    <div key={key} className="bg-background-secondary rounded">
                                                        <div className="flex flex-wrap items-center gap-x-2">
                                                            <span className="font-semibold">{key}</span> changed from
                                                            <p className="text-red-300 p-1 rounded font-mono">{show(modified[key].old)}</p>
                                                            <p className="font-medium">-&gt;</p>
                                                            <p className="text-green-300 p-1 rounded font-mono">{show(modified[key].new)}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** PHP `empty()` */
const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0 || v === '0' || v === false || (Array.isArray(v) && v.length === 0);

/** App\Admin\Actions\AuditAction: the 📜 button that opens the audit log of a record in a slide over */
export class AuditAction extends Action {
    private auditChildrenList: string[] = [];

    /** relations of the record whose audits are listed too */
    auditChildren(children: string[]) {
        this.auditChildrenList = children;
        return this;
    }

    static override getDefaultName() {
        return 'audits';
    }

    protected override setUp() {
        super.setUp();
        this.label('📜')
            .color('gray')
            .slideOver()
            .modalContent(({ record }: ActionContext) => <AuditList record={record} children={this.auditChildrenList} />)
            .modalHeading('Audit Log')
            .modalWidth('xl')
            .modalSubmitAction(false)
            .modalCancelAction(false);
    }
}
