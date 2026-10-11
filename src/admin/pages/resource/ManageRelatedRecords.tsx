import type { ReactNode } from 'react';
import type { Model } from '@/server/orm';
import { ResourcePage } from './ResourcePage';
import { ContentCell, ContentGrid } from './formPage';
import { Schema } from '../../forms/Schema';
import { Table } from '../../tables/Table';
import { RelationManager } from '../../resources/RelationManager';
import { titleCase } from '../../core/Resource';
import { trans } from '../../context';
import type { Action, ActionGroup } from '../../actions/Action';

/** `Str::headline()` */
const headline = (s: string) => titleCase(s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase());

/** the relation manager a `ManageRelatedRecords` page is built on: its form and table are the page's */
class PageRelationManager extends RelationManager {
    constructor(private readonly page: ManageRelatedRecords) {
        super();
    }
    override get relationshipName() {
        return (this.page.constructor as typeof ManageRelatedRecords).relationship;
    }
    override getTitle() {
        return headline(this.relationshipName);
    }
    override form(schema: Schema) {
        return this.page.form(schema);
    }
    override table(table: Table) {
        return this.page.table(table);
    }
}

/**
 * Port of Filament\Resources\Pages\ManageRelatedRecords: a page of a resource with a table of a relationship of
 * the record (create / edit / delete in modals).
 */
export abstract class ManageRelatedRecords extends ResourcePage {
    static override kind = 'resource-manage-related-records';
    static relationship: string;
    static navigationIcon: string | null = null;
    static activeNavigationIcon: string | null = null;
    static navigationSort: number | null = null;

    private manager?: PageRelationManager;

    /** the record whose relationship the page lists */
    get ownerRecord(): Model<any> {
        return this.record;
    }

    form(schema: Schema): Schema {
        return schema;
    }
    table(table: Table): Table {
        return table;
    }

    override getTitle() {
        const C = this.constructor as typeof ManageRelatedRecords;
        return trans('filament-panels::resources/pages/manage-related-records.title', { label: this.resource.getTitleCaseModelLabel(), relationship: headline(C.relationship) });
    }
    getBreadcrumb() {
        return headline((this.constructor as typeof ManageRelatedRecords).relationship);
    }
    static getNavigationLabel(): string {
        return this.navigationLabel ?? headline(this.relationship);
    }
    override getPageClasses() {
        return ['fi-resource-manage-related-records-page', `fi-resource-${this.resource.getSlug().replace('/', '-')}`, `fi-resource-record-${this.record?.getKey()}`];
    }

    override async mount() {
        this.record = await this.resolveRecord(this.params.record);
        this.abortUnless(await this.resource.canView(this.user, this.record));
    }

    private getManager(): PageRelationManager {
        if (!this.manager) {
            const m = new PageRelationManager(this);
            m.ownerRecord = this.record;
            m.host = this;
            m.user = this.user;
            m.tableId = 'table';
            m.tablePrefix = '';
            m.showHeading = false;
            this.manager = m;
        }
        return this.manager;
    }

    getTable(): Table {
        return this.getManager().getTable();
    }

    override getTables() {
        return { table: this.getTable() };
    }

    /** header actions of a related records page are the ones of its table */
    override getHeaderActions(): Array<Action | ActionGroup> {
        return [];
    }

    async renderContent(): Promise<ReactNode> {
        const table = this.getTable();
        return (
            <ContentGrid>
                <ContentCell>
                    <div>
                        <ContentGrid>
                            <ContentCell hidden />
                            <ContentCell>{await table.render({ pathname: this.pathname, searchParams: this.searchParams, user: this.user })}</ContentCell>
                        </ContentGrid>
                    </div>
                </ContentCell>
            </ContentGrid>
        );
    }
}
