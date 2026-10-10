import type { ReactNode } from 'react';
import { ResourcePage } from './ResourcePage';
import { ContentCell, ContentGrid } from './formPage';
import { Table } from '../../tables/Table';
import { Schema } from '../../forms/Schema';
import { CreateAction, DeleteAction, EditAction, ViewAction } from '../../actions/builtin';
import { Action, ActionGroup, findByName } from '../../actions/Action';
import { trans } from '../../context';
import { Icon } from '../../ui/Icon';
import { ListTabs } from '../../tables/client-extra';
import type { Builder } from '@/server/orm/builder';

/** Filament\Schemas\Components\Tabs\Tab as the list pages use it */
export class ListTab {
    protected _icon: string | null = null;
    protected _modify?: (q: Builder<any>) => Builder<any> | void;
    constructor(readonly label: string) {}
    static make(label: string) {
        return new ListTab(label);
    }
    icon(v: string) { this._icon = v; return this; }
    getIcon() { return this._icon; }
    modifyQueryUsing(fn: (q: Builder<any>) => Builder<any> | void) { this._modify = fn; return this; }
    modifyQuery(q: Builder<any>) { return this._modify ? (this._modify(q) ?? q) : q; }
}

/** Port of Filament\Resources\Pages\ListRecords */
export class ListRecords extends ResourcePage {
    static override kind = 'resource-list-records';

    private tableCache?: Table;

    getTitle() {
        return this.resource.getTitleCasePluralModelLabel();
    }
    getBreadcrumb() {
        return trans('filament-panels::resources/pages/list-records.breadcrumb');
    }
    override getPageClasses() {
        return ['fi-resource-list-records-page', `fi-resource-${this.resource.getSlug().replace('/', '-')}`];
    }
    override async mount() {
        this.abortUnless(await this.resource.canViewAny(this.user));
    }

    /** `getTabs()`: filters of the table query, shown as tabs above the table */
    getTabs(): Record<string, ListTab> {
        return {};
    }
    getDefaultActiveTab(): string | number | null {
        return null;
    }
    /** `$activeTab`: the `?activeTab=` of the URL, else the default tab, else the first one */
    getActiveTab(): string | null {
        const tabs = Object.keys(this.getTabs());
        if (tabs.length === 0) return null;
        const asked = this.searchParams.activeTab;
        const key = Array.isArray(asked) ? asked[0] : asked;
        if (key && tabs.includes(key)) return key;
        const def = this.getDefaultActiveTab();
        return def !== null && tabs.includes(String(def)) ? String(def) : tabs[0];
    }

    /** `table(Table $table)` of the page: the resource's table, configured for the page */
    protected configureTable(table: Table): Table {
        return table;
    }

    getTable(): Table {
        if (!this.tableCache) {
            const table = new Table();
            table.id = 'table';
            table.livewire = this;
            table.user = this.user;
            table.model = this.resource.model;
            table.resource = this.resource;
            // the default record URL: the view / edit action of the table, else the resource's view / edit page
            table.recordUrl(async (record: any) => {
                const resource = this.resource;
                const t = this.tableCache!;
                for (const name of ['view', 'edit']) {
                    const action = findByName(t.getRecordActions(), name);
                    if (!action) continue;
                    const ctx = t.recordActionContext(action, record);
                    if (!(await action.isVisible(ctx))) continue;
                    const url = await action.getUrl(ctx);
                    if (url) return url;
                }
                for (const name of ['view', 'edit'] as const) {
                    if (!resource.hasPage(name)) continue;
                    if (!(await (name === 'view' ? resource.canView(this.user, record) : resource.canEdit(this.user, record)))) continue;
                    return resource.getUrl(name, { record });
                }
                return null;
            });
            // rows without a URL open the view / edit action of the table
            table.recordAction(async (record: any) => {
                const t = this.tableCache!;
                for (const name of ['view', 'edit']) {
                    const action = findByName(t.getRecordActions(), name);
                    if (!action) continue;
                    const ctx = t.recordActionContext(action, record);
                    if (!(await action.isVisible(ctx))) continue;
                    if (await action.getUrl(ctx)) continue;
                    return action.getName();
                }
                return null;
            });
            this.tableCache = this.configureTable(this.resource.table(table));
            // the open tab narrows the query of the table
            const tab = this.getActiveTab();
            if (tab) table.modifyQueryUsing(((previous) => (q: Builder<any>) => this.getTabs()[tab].modifyQuery(previous ? (previous(q) ?? q) : q))((table as any)._modifyQuery));
            for (const list of [this.tableCache.getRecordActions(), this.tableCache.getToolbarActions(), this.tableCache.getHeaderActions()]) this.configureTableActions(list);
        }
        return this.tableCache;
    }

    /** `ListRecords::configureAction()`: edit / view / create actions of the table go to the resource's pages */
    protected configureTableActions(list: Array<Action | ActionGroup>) {
        for (const a of list) {
            if (a instanceof ActionGroup) {
                this.configureTableActions(a.actions);
                continue;
            }
            this.configureTableAction(a);
        }
    }

    /** `configureAction()` of the table's actions: link to the resource's pages */
    protected configureTableAction(a: Action) {
        if (a.hasUrl() || a.hasForm()) return;
        const resource = this.resource;
        if (a instanceof EditAction && resource.hasPage('edit')) a.url(({ record }) => resource.getUrl('edit', { record }));
        else if (a instanceof ViewAction && resource.hasPage('view')) a.url(({ record }) => resource.getUrl('view', { record }));
        else if (a instanceof CreateAction && resource.hasPage('create')) a.url(() => resource.getUrl('create'));
        // without a view page the view action opens the infolist of the resource in a modal
        else if (a instanceof ViewAction) a.form(() => this.resource.infolist(Schema.make().operation('view').model(this.getModel()).columns(2)));
    }

    override getTables() {
        return { table: this.getTable() };
    }

    /** `CreateAction` in the header of the list links to the create page */
    protected override configureAction(action: Action) {
        super.configureAction(action);
        if (action instanceof CreateAction && !action.hasUrl() && this.resource.hasPage('create')) {
            action.url(() => this.resource.getUrl('create'));
        }
    }

    async renderContent(): Promise<ReactNode> {
        const table = this.getTable();
        const tabs = Object.entries(this.getTabs());
        const active = this.getActiveTab();
        const defaultTab = tabs.length ? (this.getDefaultActiveTab() !== null && this.getTabs()[String(this.getDefaultActiveTab())] ? String(this.getDefaultActiveTab()) : tabs[0][0]) : '';
        return (
            <ContentGrid>
                {tabs.length > 0 ? (
                    <ContentCell>
                        <ListTabs id="content.resourceTabs" active={active!} defaultTab={defaultTab} tabs={tabs.map(([key, t]) => ({ key, label: t.label, icon: t.getIcon() ? <Icon icon={t.getIcon()!} /> : null }))} />
                    </ContentCell>
                ) : (
                    <ContentCell hidden id={undefined} />
                )}
                <ContentCell>{await table.render({ pathname: this.pathname, searchParams: this.searchParams, user: this.user })}</ContentCell>
            </ContentGrid>
        );
    }
}

export { DeleteAction, EditAction, ViewAction };
