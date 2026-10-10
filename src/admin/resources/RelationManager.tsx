import type { ReactNode } from 'react';
import type { Model } from '@/server/orm';
import type { Host } from '../core/host';
import type { Resource } from '../core/Resource';
import { Schema } from '../forms/Schema';
import { Table } from '../tables/Table';
import { Action } from '../actions/Action';
import { CreateAction, EditAction, ViewAction } from '../actions/builtin';
import { ContentCell, ContentGrid } from '../pages/resource/formPage';
import { canFilament as can } from '@/server/policies';
import type { User } from '@/server/models/User';
import { titleCase } from '../core/Resource';

/** `Str::headline()` */
const headline = (s: string) => titleCase(s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase());

/**
 * Port of Filament\Resources\RelationManagers\RelationManager: a table of the records related to the
 * record of the page, with create / edit / delete actions of its own.
 */
export abstract class RelationManager {
    static relationship: string;
    /** the related resource (a function when it can not be referenced yet, circular imports) */
    static relatedResource: typeof Resource | (() => typeof Resource) | null = null;
    static title: string | null = null;

    ownerRecord!: Model<any>;
    host!: Host;
    user!: User;
    /** position on the page (`relationManager0`, `rm0.search`) */
    index = 0;
    private tableCache?: Table;

    get ctor() {
        return this.constructor as typeof RelationManager;
    }

    get relationshipName(): string {
        return this.ctor.relationship;
    }

    /** the table of a relation manager has a heading and its own id / URL prefix (a page shows it without) */
    tableId: string | null = null;
    tablePrefix: string | null = null;
    showHeading = true;

    /** `getRelatedResource()` */
    get related(): typeof Resource | null {
        const r = this.ctor.relatedResource;
        if (r === null) return null;
        return 'getSlug' in (r as object) ? (r as typeof Resource) : (r as () => typeof Resource)();
    }

    getTitle(): string {
        if (this.ctor.title) return this.ctor.title;
        if (this.related) return titleCase(this.related.getPluralModelLabel());
        return headline(this.relationshipName);
    }

    getRelatedModel(): any {
        return this.ownerRecord.relationDef(this.relationshipName)!.related();
    }

    /** `canViewForRecord()`: the user may list the related records */
    async canViewForRecord(): Promise<boolean> {
        const model = this.getRelatedModel();
        return can(this.user, 'viewAny', model);
    }

    /** the form of the create / edit modals (the related resource's form by default) */
    form(schema: Schema): Schema {
        return this.related ? this.related.form(schema) : schema;
    }

    infolist(schema: Schema): Schema {
        return this.related ? this.related.infolist(schema) : this.form(schema);
    }

    table(table: Table): Table {
        return table;
    }

    /** `getTableQuery()`: a query of its own instead of the relationship of the owner */
    getTableQuery(): any | null {
        return null;
    }

    private makeSchema(operation: string): Schema {
        const schema = Schema.make().operation(operation).model(this.getRelatedModel());
        if (!schema.hasCustomColumns()) schema.columns(2);
        return this.form(schema);
    }

    getTable(): Table {
        if (this.tableCache) return this.tableCache;
        const table = new Table();
        table.id = this.tableId ?? `relationManager${this.index}`;
        table.prefix = this.tablePrefix ?? `rm${this.index}`;
        table.livewire = this.host;
        table.user = this.user;
        table.model = this.getRelatedModel();
        table.ownerRecord = this.ownerRecord;
        table.resource = this.related ?? undefined;
        table.queryFrom(() => this.getTableQuery() ?? this.ownerRecord.relation(this.relationshipName));
        if (this.showHeading) table.heading(this.getTitle());
        const related = this.related;
        if (related) {
            related.table(table);
            // rows link to the related resource's pages
            if (related.hasPage('edit') || related.hasPage('view')) {
                table.recordUrl(async (record: any) => {
                    if (related.hasPage('view') && (await related.canView(this.user, record))) return related.getUrl('view', { record });
                    if (related.hasPage('edit') && (await related.canEdit(this.user, record))) return related.getUrl('edit', { record });
                    return null;
                });
            }
        }
        this.table(table);
        // `heading()` set by the manager's own table wins
        for (const list of [table.getRecordActions(), table.getToolbarActions(), table.getHeaderActions()]) this.configureActions(list);
        // rows without a link open their edit / view modal
        table.recordAction(async (record: any) => {
            for (const name of ['view', 'edit']) {
                const action = table.getRecordActions().flatMap((a: any) => (a.actions ?? [a]) as Action[]).find((a) => a.getName() === name);
                if (!action) continue;
                const ctx = table.recordActionContext(action, record);
                if (!(await action.isVisible(ctx))) continue;
                if (await action.getUrl(ctx)) continue;
                return action.getName();
            }
            return null;
        });
        this.tableCache = table;
        return table;
    }

    private configureActions(list: Array<any>) {
        const related = this.related;
        for (const a of list) {
            if (a.actions) {
                this.configureActions(a.actions);
                continue;
            }
            const action = a as Action;
            if (action.hasUrl()) continue;
            if (action instanceof CreateAction) {
                if (related?.hasPage('create')) action.url(() => related.getUrl('create'));
                else {
                    if (!action.hasForm()) action.form(() => this.makeSchema('create'));
                    action.action(async (ctx) => {
                        const record = await this.ownerRecord.relation(this.relationshipName).create(ctx.data ?? {});
                        if (ctx.formSchema) {
                            ctx.formRc.record = record;
                            await ctx.formSchema.saveRelationships(ctx.formRc, record, ctx.data ?? {});
                        }
                        return record;
                    });
                }
            } else if (action instanceof EditAction) {
                if (related?.hasPage('edit')) action.url(({ record }) => related.getUrl('edit', { record }));
                else if (!action.hasForm()) action.form(() => this.makeSchema('edit'));
            } else if (action instanceof ViewAction) {
                if (related?.hasPage('view')) action.url(({ record }) => related.getUrl('view', { record }));
                else if (!action.hasForm()) action.form(() => this.infolist(Schema.make().operation('view').model(this.getRelatedModel()).columns(2)));
            }
        }
    }

    /** the markup of the manager inside the page */
    async render(searchParams: Record<string, any>): Promise<ReactNode> {
        const table = this.getTable();
        const node = await table.render({ pathname: this.host.pathname, searchParams, user: this.user });
        return (
            <div className="fi-resource-relation-manager">
                <ContentGrid>
                    <ContentCell hidden />
                    <ContentCell>{node}</ContentCell>
                </ContentGrid>
            </div>
        );
    }
}
