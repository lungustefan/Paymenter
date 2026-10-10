import type { ReactNode } from 'react';
import { ResourcePage } from './ResourcePage';
import { ContentCell, ContentGrid } from './formPage';
import { Table } from '../../tables/Table';
import { CreateAction, DeleteAction, EditAction, ViewAction } from '../../actions/builtin';
import { Action, ActionGroup } from '../../actions/Action';
import { trans } from '../../context';

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
            // the default record URL: the edit page (or the view page)
            const pages = this.resource.getPages();
            const hasUrl = pages.edit || pages.view;
            if (hasUrl) {
                table.recordUrl(async (record: any) => {
                    const resource = this.resource;
                    if (resource.hasPage('view') && (await resource.canView(this.user, record))) return resource.getUrl('view', { record });
                    if (resource.hasPage('edit') && (await resource.canEdit(this.user, record))) return resource.getUrl('edit', { record });
                    return null;
                });
            }
            this.tableCache = this.configureTable(this.resource.table(table));
            for (const list of [this.tableCache.getRecordActions(), this.tableCache.getToolbarActions(), this.tableCache.getHeaderActions()]) this.configureTableActions(list);
        }
        return this.tableCache;
    }

    /** `ListRecords::configureAction()`: edit / view / create actions of the table go to the resource's pages */
    private configureTableActions(list: Array<Action | ActionGroup>) {
        for (const a of list) {
            if (a instanceof ActionGroup) {
                this.configureTableActions(a.actions);
                continue;
            }
            if (a.hasUrl() || a.hasForm()) continue;
            const resource = this.resource;
            if (a instanceof EditAction && resource.hasPage('edit')) a.url(({ record }) => resource.getUrl('edit', { record }));
            else if (a instanceof ViewAction && resource.hasPage('view')) a.url(({ record }) => resource.getUrl('view', { record }));
            else if (a instanceof CreateAction && resource.hasPage('create')) a.url(() => resource.getUrl('create'));
        }
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
        return (
            <ContentGrid>
                <ContentCell hidden id={undefined} />
                <ContentCell>{await table.render({ pathname: this.pathname, searchParams: this.searchParams, user: this.user })}</ContentCell>
            </ContentGrid>
        );
    }
}

export { DeleteAction, EditAction, ViewAction };
