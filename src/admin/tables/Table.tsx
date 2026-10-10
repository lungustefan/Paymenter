import { Fragment, type ReactNode } from 'react';
import type { Builder, ModelCtor } from '@/server/orm';
import type { User } from '@/server/models/User';
import type { Resource } from '../core/Resource';
import type { ActionRef } from '../core/host';
import { Action, ActionGroup, BulkActionGroup, findByName, type ActionContext } from '../actions/Action';
import { renderActionItem, renderActionsGroup } from '../actions/render';
import { Column, kebabName } from './columns/Column';
import { adminContext, trans, transChoice } from '../context';
import { parseTableState, type TableState } from './state';
import { Icon } from '../ui/Icon';
import { badgeClass, buttonClass, iconButtonClass } from '../ui/classes';
import { cn } from '@themes/default/components/cn';
import { GroupCheckbox, PageButton, PageCheckbox, PerPageSelect, RecordCheckbox, SearchInput, SelectionIndicator, SortButton, TableRoot, TableRow } from './client';
import { ActionDropdown, ModalHost } from '../actions/client';
import { renderFiltersForm, FiltersPanel, type BaseFilter } from './filters';
import { TableHeaderCtn, ToolbarWrapper, ReorderTrigger, FilterIndicators } from './client-extra';

export interface TableHost {
    pathname: string;
    searchParams: Record<string, string | string[] | undefined>;
    user: User;
}

type Paginated = { data: any[]; total: number; per_page: number; current_page: number; last_page: number; from: number | null; to: number | null };

/** Laravel's `UrlWindow` (3 pages on each side of the current one) */
export function paginationElements(current: number, last: number, onEachSide = 3): Array<number | '...'> {
    const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
    let first: number[] = [];
    let slider: number[] | null = null;
    let end: number[] | null = null;
    if (last < onEachSide * 2 + 8) first = range(1, last);
    else {
        const window = onEachSide + 4;
        if (current <= window) {
            first = range(1, window + onEachSide);
            end = range(last - 1, last);
        } else if (current > last - window) {
            first = range(1, 2);
            end = range(last - (window + (onEachSide - 1)), last);
        } else {
            first = range(1, 2);
            slider = range(current - onEachSide, current + onEachSide);
            end = range(last - 1, last);
        }
    }
    const out: Array<number | '...'> = [...first];
    if (slider) out.push('...', ...slider);
    if (end) out.push('...', ...end);
    return out;
}

/**
 * Port of Filament\Tables\Table: the definition of a table (columns, filters, actions, ...) and the code that
 * queries and renders it. The state (search, sort, filters, page) comes from the URL.
 */
/** Filament\Tables\Grouping\Group */
export interface TableGroup {
    id: string;
    label?: string;
    /** column the rows are grouped by (defaults to the id) */
    column?: string;
    getTitle?: (record: any) => string | null | Promise<string | null>;
    titlePrefixedWithLabel?: boolean;
}
/** `str($name)->afterLast('.')->kebab()->replace(['-', '_'], ' ')->ucfirst()` */
const groupLabel = (name: string) => {
    const words = (name.split('.').pop() as string).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[-_]+/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};
const toGroup = (g: TableGroup | string): TableGroup => (typeof g === 'string' ? { id: g } : g);

export class Table {
    /** DOM / dispatch id of the table: `table` or `rm0` (relation managers) */
    id = 'table';
    /** URL parameter prefix (relation managers use `rm0.`) */
    prefix = '';
    livewire: any = null;
    user!: User;
    model!: ModelCtor<any>;
    resource?: typeof Resource;
    /** the record a relation manager belongs to */
    ownerRecord: any = null;

    protected _columns: Column[] = [];
    protected _filters: BaseFilter[] = [];
    protected _recordActions: Array<Action | ActionGroup> = [];
    protected _toolbarActions: Array<Action | ActionGroup> = [];
    protected _headerActions: Array<Action | ActionGroup> = [];
    protected _emptyStateActions: Array<Action | ActionGroup> = [];
    protected _defaultSort?: { column: string | ((q: Builder<any>, direction: 'asc' | 'desc') => any); direction: 'asc' | 'desc' };
    protected _paginated: boolean | number[] = true;
    protected _pageOptions: Array<number | 'all'> = [5, 10, 25, 50];
    protected _defaultPerPage: number | 'all' = 10;
    protected _extremeLinks = false;
    protected _searchOnBlur = false;
    protected _searchDebounce = 500;
    protected _searchPlaceholder?: string;
    protected _recordUrl?: ((record: any) => string | null | Promise<string | null>) | null;
    protected _recordUrlNewTab = false;
    protected _recordAction?: string | null;
    protected _query?: (q: Builder<any>) => void;
    protected _modifyQuery?: (q: Builder<any>) => Builder<any> | void;
    protected _heading?: string;
    protected _description?: string;
    protected _emptyHeading?: string;
    protected _emptyDescription?: string | null;
    protected _emptyIcon = 'heroicon-o-x-mark';
    protected _reorder?: { column: string; direction: 'asc' | 'desc' } | null;
    protected _poll?: string;
    protected _striped = false;
    protected _recordClasses?: (record: any) => string | string[] | Record<string, boolean>;
    protected _selectable?: boolean;
    protected _isRecordSelectable?: (record: any) => boolean;
    protected _groups: Array<TableGroup> = [];
    protected _defaultGroup?: TableGroup;
    protected _filtersLayout: 'dropdown' | 'modal' | 'above' = 'dropdown';
    protected _deferFilters = true;
    protected _filtersFormColumns = 1;
    protected _modelLabel?: string;
    protected _pluralModelLabel?: string;
    protected _inverseRelationship?: string;
    protected _defaultKeySort = true;
    protected _extraAttributes: Record<string, any> = {};

    static make(): Table {
        return new Table();
    }

    /* ---- fluent configuration ---- */
    columns(list: Column[]) { this._columns = list; for (const c of list) c.table = this; return this; }
    filters(list: BaseFilter[], layout?: 'dropdown' | 'modal' | 'above') { this._filters = list; for (const f of list) f.table = this; if (layout) this._filtersLayout = layout; return this; }
    recordActions(list: Array<Action | ActionGroup>) { this._recordActions = list; return this; }
    toolbarActions(list: Array<Action | ActionGroup>) { this._toolbarActions = list; return this; }
    /** `->bulkActions()` of Filament v3 */
    bulkActions(list: Array<Action | ActionGroup>) { this._toolbarActions = [...this._toolbarActions, ...list]; return this; }
    headerActions(list: Array<Action | ActionGroup>) { this._headerActions = list; return this; }
    emptyStateActions(list: Array<Action | ActionGroup>) { this._emptyStateActions = list; return this; }
    defaultSort(column: string | ((q: Builder<any>, direction: 'asc' | 'desc') => any), direction: 'asc' | 'desc' = 'asc') { this._defaultSort = { column, direction }; return this; }
    paginated(v: boolean | number[] = true) { this._paginated = v; if (Array.isArray(v)) this._pageOptions = v; return this; }
    paginationPageOptions(v: Array<number | 'all'>) { this._pageOptions = v; return this; }
    defaultPaginationPageOption(v: number | 'all') { this._defaultPerPage = v; return this; }
    extremePaginationLinks(v = true) { this._extremeLinks = v; return this; }
    searchOnBlur(v = true) { this._searchOnBlur = v; return this; }
    searchDebounce(ms: number) { this._searchDebounce = ms; return this; }
    searchPlaceholder(v: string) { this._searchPlaceholder = v; return this; }
    recordUrl(v: ((record: any) => string | null | Promise<string | null>) | null, shouldOpenInNewTab = false) { this._recordUrl = v; this._recordUrlNewTab = shouldOpenInNewTab; return this; }
    recordAction(v: string | null) { this._recordAction = v; return this; }
    /** `->query(fn)`: replaces the base query */
    query(fn: (q: Builder<any>) => void) { this._query = fn; return this; }
    modifyQueryUsing(fn: (q: Builder<any>) => Builder<any> | void) { this._modifyQuery = fn; return this; }
    heading(v: string) { this._heading = v; return this; }
    description(v: string) { this._description = v; return this; }
    emptyStateHeading(v: string) { this._emptyHeading = v; return this; }
    emptyStateDescription(v: string | null) { this._emptyDescription = v; return this; }
    emptyStateIcon(v: string) { this._emptyIcon = v; return this; }
    reorderable(column: string | null, direction: 'asc' | 'desc' = 'asc') { this._reorder = column ? { column, direction } : null; return this; }
    poll(interval: string) { this._poll = interval; return this; }
    striped(v = true) { this._striped = v; return this; }
    recordClasses(fn: (record: any) => string | string[] | Record<string, boolean>) { this._recordClasses = fn; return this; }
    selectable(v = true) { this._selectable = v; return this; }
    checkIfRecordIsSelectableUsing(fn: (record: any) => boolean) { this._isRecordSelectable = fn; return this; }
    groups(list: Array<TableGroup | string>) { this._groups = list.map(toGroup); return this; }
    /** `defaultGroup('model')`: rows are grouped (and ordered) by a column */
    defaultGroup(group: TableGroup | string) { this._defaultGroup = toGroup(group); return this; }
    filtersLayout(v: 'dropdown' | 'modal' | 'above') { this._filtersLayout = v; return this; }
    deferFilters(v = true) { this._deferFilters = v; return this; }
    filtersFormColumns(v: number) { this._filtersFormColumns = v; return this; }
    modelLabel(v: string) { this._modelLabel = v; return this; }
    pluralModelLabel(v: string) { this._pluralModelLabel = v; return this; }
    inverseRelationship(v: string) { this._inverseRelationship = v; return this; }
    defaultKeySort(v = true) { this._defaultKeySort = v; return this; }
    extraAttributes(v: Record<string, any>) { this._extraAttributes = v; return this; }

    /* ---- configuration the host reads ---- */
    getColumns() { return this._columns; }
    getFilters() { return this._filters; }
    getRecordActions() { return this._recordActions; }
    getToolbarActions() { return this._toolbarActions; }
    getHeaderActions() { return this._headerActions; }
    getColumn(name: string) { return this._columns.find((c) => c.getName() === name); }
    getModelLabel() { return this._modelLabel ?? this.resource?.getModelLabel() ?? ''; }
    getPluralModelLabel() { return this._pluralModelLabel ?? this.resource?.getPluralModelLabel() ?? ''; }
    isReorderable() { return !!this._reorder; }
    getReorderColumn() { return this._reorder?.column ?? null; }
    isSearchable() { return this._columns.some((c) => c.isGloballySearchable()); }
    isSearchableByColumn() { return this._columns.some((c) => c.isIndividuallySearchable()); }
    hasBulkActions() {
        const has = (list: Array<Action | ActionGroup>): boolean => list.some((a) => (a instanceof ActionGroup ? has(a.actions) : a.isBulk()));
        return has(this._toolbarActions);
    }
    isSelectionEnabled() {
        return this._selectable ?? this.hasBulkActions();
    }
    getPerPage(state: TableState): number | 'all' {
        const options = this._pageOptions;
        if (state.perPage !== null && options.includes(state.perPage as any)) return state.perPage;
        return options.includes(this._defaultPerPage) ? this._defaultPerPage : (options[0] ?? 10);
    }
    isPaginated() {
        return this._paginated !== false;
    }

    /** the visible columns (not hidden, not toggled off) */
    async getVisibleColumns(state: TableState): Promise<Column[]> {
        const out: Column[] = [];
        for (const column of this._columns) {
            if (await column.isHidden(null)) continue;
            if (column.isToggleable()) {
                const hidden = state.hiddenColumns ? state.hiddenColumns.includes(column.getName()) : column.isToggledHiddenByDefault();
                if (hidden) continue;
            }
            out.push(column);
        }
        return out;
    }

    /* ---- data ---- */
    protected baseQuery(): Builder<any> {
        let q: Builder<any>;
        if (this._query) {
            q = this.model.query();
            this._query(q);
        } else q = this.resource ? this.resource.getEloquentQuery() : this.model.query();
        return q;
    }

    /** the query with the filters and the search applied (what `getFilteredTableQuery()` returns) */
    async filteredQuery(state: TableState, visible: Column[]): Promise<Builder<any>> {
        let q = this.baseQuery();
        if (this._modifyQuery) q = this._modifyQuery(q) ?? q;
        for (const filter of this._filters) await filter.applyTo(q, state.filters);
        // column searches, then the global search
        for (const [name, search] of Object.entries(state.columnSearches)) {
            const column = this.getColumn(name);
            if (!search || !column || !column.isIndividuallySearchable()) continue;
            q.where((w: Builder<any>) => column.applySearchConstraint(w, search, { value: true }));
        }
        const search = state.search.trim();
        if (search) {
            q.where((w: Builder<any>) => {
                const isFirst = { value: true };
                for (const column of visible) if (column.isGloballySearchable()) column.applySearchConstraint(w, search, isFirst);
            });
        }
        return q;
    }

    protected activeGroup(state: TableState): TableGroup | undefined {
        if (state.reordering) return undefined;
        return this._defaultGroup;
    }

    /** the title of the group a record belongs to (`Group::getTitle()`) */
    protected async groupTitle(group: TableGroup, record: any): Promise<string> {
        if (group.getTitle) return String((await group.getTitle(record)) ?? '');
        const value = record[group.column ?? group.id];
        return value === null || value === undefined ? '' : String(value);
    }

    protected async applySorting(q: Builder<any>, state: TableState, visible: Column[]) {
        if (state.reordering && this._reorder) return q.orderBy(this._reorder.column, this._reorder.direction);
        const group = this.activeGroup(state);
        if (group) q.orderBy(group.column ?? group.id, 'asc');
        const sortColumn = state.sortColumn ? visible.find((c) => c.getName() === state.sortColumn && c.isSortable()) : undefined;
        if (sortColumn) sortColumn.applySort(q, state.sortDirection === 'desc' ? 'desc' : 'asc');
        if (this._defaultSort) {
            const direction = this._defaultSort.direction ?? (state.sortDirection === 'desc' ? 'desc' : 'asc');
            const d = this._defaultSort.column;
            if (typeof d === 'string') {
                if (d !== state.sortColumn) {
                    const col = visible.find((c) => c.getName() === d && c.isSortable());
                    if (col) col.applySort(q, direction);
                    else q.orderBy(d, direction);
                }
            } else d(q, direction);
        }
        if (this._defaultKeySort) q.orderBy(this.model.primaryKey ?? 'id', state.sortDirection === 'desc' ? 'desc' : 'asc');
        return q;
    }

    async getRecords(state: TableState, visible: Column[]): Promise<Paginated> {
        const q = await this.filteredQuery(state, visible);
        await this.applySorting(q, state, visible);
        for (const column of visible) for (const load of column.getEagerLoads(this.model)) q.with(load);
        if (!this.isPaginated() || (state.reordering && false)) {
            const data = await q.get();
            return { data, total: data.length, per_page: data.length, current_page: 1, last_page: 1, from: data.length ? 1 : null, to: data.length || null };
        }
        const perPage = this.getPerPage(state);
        if (perPage === 'all') {
            const data = await q.get();
            return { data, total: data.length, per_page: data.length, current_page: 1, last_page: 1, from: data.length ? 1 : null, to: data.length || null };
        }
        return q.paginate(perPage, state.page);
    }

    async allKeys(state: TableState): Promise<Array<string | number>> {
        const visible = await this.getVisibleColumns(state);
        const q = await this.filteredQuery(state, visible);
        const key = this.model.primaryKey ?? 'id';
        return (await q.get()).map((r: any) => r[key]);
    }

    recordKey(record: any): string {
        return String(record.getKey());
    }

    /* ---- actions ---- */
    /** the context of a record action (`$action->record($record)`) */
    recordActionContext(action: Action, record: any): ActionContext {
        return this.actionContext({ action, record });
    }

    protected actionContext(extra: Partial<ActionContext> = {}): ActionContext {
        return { get: () => undefined, set: () => undefined, user: this.user, livewire: this.livewire, model: this.model, resource: this.resource, ownerRecord: this.ownerRecord, table: this, action: undefined as any, ...extra } as ActionContext;
    }

    /** `table.<id>.record.<key>.<name>` etc. */
    async findAction(rest: string): Promise<ActionRef | null> {
        const [kind, ...parts] = rest.split('.');
        if (kind === 'record') {
            const name = parts.pop()!;
            const key = parts.join('.');
            const record = await this.baseQuery().where(this.model.primaryKey ?? 'id', key).first();
            if (!record) return null;
            const action = findByName(this._recordActions, name);
            return action ? { action, ctx: this.actionContext({ action, record }) } : null;
        }
        const list = kind === 'header' ? this._headerActions : kind === 'toolbar' || kind === 'bulk' ? this._toolbarActions : kind === 'empty' ? this._emptyStateActions : [];
        const action = findByName(list, parts.join('.'));
        return action ? { action, ctx: this.actionContext({ action }) } : null;
    }

    /** toggle / inline input / reorder updates of the table */
    async update(action: string, args: { record?: string | number; column?: string; value?: unknown; order?: Array<string | number> }, state: TableState): Promise<{ ok: boolean; data?: any }> {
        if (action === 'allKeys') return { ok: true, data: await this.allKeys(state) };
        if (action === 'reorder' && this._reorder && args.order) {
            const col = this._reorder.column;
            let i = 1;
            for (const key of args.order) {
                await this.model.query().where(this.model.primaryKey ?? 'id', key).update({ [col]: i++ });
            }
            return { ok: true };
        }
        if ((action === 'toggle' || action === 'input') && args.record !== undefined && args.column) {
            const record = await this.baseQuery().where(this.model.primaryKey ?? 'id', args.record).first();
            const column: any = this.getColumn(args.column);
            if (!record || !column?.updateState) return { ok: false };
            await column.updateState(record, args.value);
            return { ok: true };
        }
        return { ok: false };
    }

    /* ---- rendering ---- */
    async render(host: TableHost): Promise<ReactNode> {
        const state = parseTableState(host.searchParams, this.prefix);
        const { tr } = adminContext();
        const visible = await this.getVisibleColumns(state);
        const result = await this.getRecords(state, visible);
        const records = result.data;
        const pluralLabel = this.getPluralModelLabel();
        const isSelectionEnabled = this.isSelectionEnabled();
        const reordering = state.reordering && this.isReorderable();
        const hasFilters = this._filters.length > 0;
        const activeFilters = hasFilters ? (await Promise.all(this._filters.map((f) => f.getActiveCount(state.filters)))).reduce((a, b) => a + b, 0) : 0;
        const indicators: Array<{ label: string; remove?: { filter: string } | 'search' }> = [];
        if (state.search.trim()) indicators.push({ label: `${trans('filament-tables::table.fields.search.indicator')}: ${state.search.trim()}`, remove: 'search' });
        for (const f of this._filters) for (const label of await f.getIndicators(state.filters)) indicators.push({ label, remove: { filter: f.getName() } });

        // visible header / toolbar actions
        const ctx = this.actionContext();
        const visibleOf = async (list: Array<Action | ActionGroup>) => {
            const out: Array<Action | ActionGroup> = [];
            for (const a of list) if (a instanceof ActionGroup ? await a.isVisible(ctx) : await a.isVisible({ ...ctx, action: a })) out.push(a);
            return out;
        };
        const headerActions = await visibleOf(this._headerActions);
        const toolbarActions = await visibleOf(this._toolbarActions);
        const nonBulkToolbar = toolbarActions.some((a) => (a instanceof BulkActionGroup ? false : a instanceof ActionGroup ? a.actions.some((x) => x instanceof Action && !x.isBulk()) : !a.isBulk()));
        const hasGlobalSearch = this.isSearchable();
        const hasFiltersTrigger = hasFilters && this._filtersLayout !== 'above';
        const hasHeaderToolbar = this.isReorderable() || hasGlobalSearch || hasFiltersTrigger || this._groups.length > 0;
        const hasHeader = !!(this._heading || this._description || (headerActions.length && !reordering) || this.isReorderable() || hasGlobalSearch || hasFilters || indicators.length);
        const headerMode = hasHeader || nonBulkToolbar ? 'visible' : toolbarActions.length ? 'selection' : 'hidden';
        const toolbarMode = hasHeaderToolbar || nonBulkToolbar ? 'visible' : toolbarActions.length ? 'selection' : 'hidden';

        const hasPagination = this.isPaginated() && this.getPerPage(state) !== 'all' && result.total > 0;
        const hasEmptyState = records.length === 0;

        // eager load what the cells read
        const keys = records.map((r) => this.recordKey(r));
        const rowRecordActions = new Map<string, ReactNode[]>();
        let hasRecordActionsForAnyRecord = false;
        if (!reordering) {
            for (const record of records) {
                const key = this.recordKey(record);
                const rendered: ReactNode[] = [];
                const rctx = this.actionContext({ record });
                for (const a of this._recordActions) {
                    const visibleAction = a instanceof ActionGroup ? await a.isVisible(rctx) : await a.isVisible({ ...rctx, action: a });
                    if (!visibleAction) continue;
                    const id = a instanceof Action ? `table.${this.id}.record.${key}.${a.getName()}` : `table.${this.id}.record.${key}.g${rendered.length}`;
                    rendered.push(<Fragment key={id}>{await renderActionItem(a, rctx, id, { defaultStyle: 'link', defaultSize: 'sm', useTableIcon: true })}</Fragment>);
                }
                rowRecordActions.set(key, rendered);
                if (rendered.length) hasRecordActionsForAnyRecord = true;
            }
        }

        const urlOf = async (record: any): Promise<string | null> => (this._recordUrl === undefined || this._recordUrl === null ? null : await this._recordUrl(record));
        const flatActionCount = (() => {
            const count = (l: Array<Action | ActionGroup>): number => l.reduce((n, a) => n + (a instanceof ActionGroup ? count(a.actions) : 1), 0);
            return count(this._recordActions);
        })();

        const sortLabel = state.sortColumn;
        const headerCells: ReactNode[] = [];
        for (const column of visible) {
            const name = column.getName();
            const active = sortLabel === name;
            const sortable = column.isSortable() && !reordering;
            const alignment = await column.getAlignment();
            const width = column.getWidth();
            const label = await column.getLabelFor();
            const tooltip = column.getHeaderTooltip();
            const labelNode = tooltip ? <span title={tooltip} className="fi-ta-header-cell-tooltip">{label}</span> : label;
            headerCells.push(
                <th
                    key={name}
                    aria-sort={sortable ? (active ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    scope="col"
                    className={cn('fi-ta-header-cell', `fi-ta-header-cell-${kebabName(name)}`, !width && column.canGrow() && 'fi-growable', column.canHeaderWrap() && 'fi-wrapped', active && 'fi-ta-header-cell-sorted', alignment && (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(alignment) ? `fi-align-${alignment}` : alignment), column.getHiddenFrom() && `${column.getHiddenFrom()}:fi-hidden`, column.getVisibleFrom() && `${column.getVisibleFrom()}:fi-visible`)}
                    style={width ? { width } : undefined}
                >
                    {sortable ? (
                        <SortButton column={name} active={active} direction={active ? state.sortDirection : null} className="fi-ta-header-cell-sort-btn">
                            {labelNode}
                            <Icon icon={active && state.sortDirection === 'asc' ? 'heroicon:chevron-up' : 'heroicon:chevron-down'} />
                        </SortButton>
                    ) : (
                        labelNode
                    )}
                </th>,
            );
        }

        // rows
        const rows: ReactNode[] = [];
        const selectionLabel = trans('filament-tables::table.fields.bulk_select_page.label');
        let index = 0;
        const group = this.activeGroup(state);
        const groupTitles: string[] = group ? await Promise.all(records.map((r) => this.groupTitle(group, r))) : [];
        let previousGroupTitle: string | null = null;
        for (const record of records) {
            const key = this.recordKey(record);
            if (group && groupTitles[index] !== previousGroupTitle) {
                const title = groupTitles[index];
                const keysInGroup = records.filter((_r, i) => groupTitles[i] === title).map((r) => this.recordKey(r));
                const label = group.titlePrefixedWithLabel === false ? null : (group.label ?? groupLabel(group.id));
                const heading = label ? `${label}: ${title}` : title;
                rows.push(
                    <tr key={`group-${index}`} className="fi-ta-group-header-row fi-ta-row">
                        {isSelectionEnabled && (
                            <td className="fi-ta-cell fi-ta-group-selection-cell">
                                <GroupCheckbox keys={keysInGroup} label={trans('filament-tables::table.fields.bulk_select_group.label', { title })} />
                            </td>
                        )}
                        <td className="fi-ta-group-header-cell" colSpan={visible.length + (hasRecordActionsForAnyRecord ? 1 : 0)}>
                            <div className="fi-ta-group-header">
                                <div>
                                    <h2 className="fi-ta-group-heading">{heading}</h2>
                                </div>
                            </div>
                        </td>
                    </tr>,
                );
                previousGroupTitle = title;
            }
            const url = await urlOf(record);
            const clickable = !!url || !!this._recordAction;
            const classes = this._recordClasses ? this._recordClasses(record) : null;
            const extra = Array.isArray(classes) ? classes : typeof classes === 'string' ? [classes] : classes ? Object.entries(classes).filter(([, v]) => v).map(([k]) => k) : [];
            const selectable = isSelectionEnabled && (this._isRecordSelectable ? this._isRecordSelectable(record) : true);
            const cells: ReactNode[] = [];
            if (reordering) {
                cells.push(
                    <td key="reorder" className="fi-ta-cell">
                        <button aria-label={trans('filament-tables::table.actions.reorder_record.label', { key })} className="fi-ta-reorder-handle fi-icon-btn" type="button">
                            <Icon icon="heroicon:bars-2" />
                        </button>
                    </td>,
                );
            } else if (isSelectionEnabled) {
                cells.push(
                    <td key="select" className="fi-ta-cell fi-ta-selection-cell">
                        {selectable ? <RecordCheckbox recordKey={key} label={trans('filament-tables::table.fields.bulk_select_record.label', { key })} group={group ? groupTitles[index] : undefined} /> : null}
                    </td>,
                );
            }
            for (const column of visible) {
                const loop = { index, iteration: index + 1, first: index === 0, last: index === records.length - 1, count: records.length };
                const classesCell = (await column.cellClasses(record)).join(' ');
                const columnUrl = column.hasUrl() ? await column.getUrl(record) : null;
                const wrapperTag: 'a' | 'button' | 'div' = (columnUrl || (url && !column.hasAction())) && !column.isClickDisabled() && !reordering ? 'a' : 'div';
                const content = await column.render(record, { recordKey: key, rowLoop: loop });
                const colClass = cn('fi-ta-col', wrapperTag === 'a' && !!columnUrl && 'fi-ta-col-has-column-url');
                cells.push(
                    <td key={column.getName()} className={classesCell}>
                        {wrapperTag === 'a' ? (
                            <a href={columnUrl || url || '#'} {...(columnUrl ? (column.shouldOpenUrlInNewTab() ? { target: '_blank', rel: 'noopener noreferrer' } : {}) : this._recordUrlNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={colClass}>
                                {content}
                            </a>
                        ) : (
                            <div className={colClass}>{content}</div>
                        )}
                    </td>,
                );
            }
            if (!reordering && hasRecordActionsForAnyRecord) {
                cells.push(
                    <td key="actions" className="fi-ta-cell">
                        <div className="fi-ta-actions">{rowRecordActions.get(key)}</div>
                    </td>,
                );
            }
            rows.push(
                <TableRow key={key} recordKey={selectable && !reordering ? key : null} className={cn('fi-ta-row', clickable && 'fi-clickable', this._striped && index % 2 === 1 && 'fi-striped', ...extra)}>
                    {cells}
                </TableRow>,
            );
            index++;
        }

        // pagination
        const perPage = this.getPerPage(state);
        const pageOptions = this._paginated === false ? [] : this._pageOptions.map(String);
        const pagination = hasPagination ? await this.renderPagination(result, perPage, pageOptions) : null;

        const allCount = result.total;
        const searchLabel = trans('filament-tables::table.fields.search.label');

        const emptyHeading = this._emptyHeading ?? trans('filament-tables::table.empty.heading', { model: pluralLabel });
        const emptyDescription = this._emptyDescription !== undefined ? this._emptyDescription : state.search.trim() || indicators.length ? null : trans('filament-tables::table.empty.description', { model: this.getModelLabel() });

        const filtersForm = hasFiltersTrigger ? await renderFiltersForm(this, state.filters, this._filtersFormColumns) : null;

        const toolbar = (
            <>
                <div className="fi-ta-actions fi-align-start fi-wrapped">
                    {this.isReorderable() && (
                        <ReorderTrigger reordering={reordering} prefixParam={this.prefix ? `${this.prefix}.reordering` : 'reordering'} labels={{ enable: trans('filament-tables::table.actions.enable_reordering.label'), disable: trans('filament-tables::table.actions.disable_reordering.label') }} />
                    )}
                    {!reordering &&
                        (await Promise.all(
                            toolbarActions.map(async (a, i) => {
                                const id = a instanceof Action ? `table.${this.id}.toolbar.${a.getName()}` : `table.${this.id}.toolbar.g${i}`;
                                return <Fragment key={id}>{await renderToolbarItem(a, ctx, id)}</Fragment>;
                            }),
                        ))}
                </div>
                {(hasGlobalSearch || hasFiltersTrigger) && (
                    <div>
                        {hasGlobalSearch && (
                            <div className="fi-ta-search-field">
                                <label className="fi-sr-only">
                                    {searchLabel}
                                </label>
                                <div className="fi-input-wrp">
                                    <div className="fi-input-wrp-prefix fi-input-wrp-prefix-has-content fi-inline">
                                        <Icon icon="heroicon:magnifying-glass" />
                                    </div>
                                    <div className="fi-input-wrp-content-ctn">
                                        <SearchInput param={this.prefix ? `${this.prefix}.search` : 'search'} initial={state.search} debounce={this._searchDebounce} onBlur={this._searchOnBlur} placeholder={this._searchPlaceholder ?? trans('filament-tables::table.fields.search.placeholder')} className="fi-input fi-input-has-inline-prefix" />
                                    </div>
                                </div>
                            </div>
                        )}
                        {filtersForm && (
                            <FiltersPanel
                                form={filtersForm.node}
                                initialState={filtersForm.initial}
                                activeCount={activeFilters}
                                deferred={this._deferFilters}
                                prefix={this.prefix}
                                labels={{ heading: trans('filament-tables::table.filters.heading'), reset: trans('filament-tables::table.filters.actions.reset.label'), apply: trans('filament-tables::table.filters.actions.apply.label'), filter: trans('filament-tables::table.actions.filter.label') }}
                                triggerIcon={<Icon icon="heroicon:funnel" />}
                                applyClass={buttonClass({ color: 'primary', size: 'md', extra: 'fi-ac-btn-action' })}
                            />
                        )}
                    </div>
                )}
            </>
        );

        const modalHostHere = !adminContext().modalsPlaced;
        adminContext().modalsPlaced = true;
        return (
            <TableRoot tableId={this.id} pageKeys={keys} allCount={allCount} className={cn('fi-ta', ...Object.entries(this._extraAttributes).filter(([k]) => k === 'class').map(([, v]) => String(v)))}>
                <input type="hidden" defaultValue={allCount} />
                <div className={cn('fi-ta-ctn', hasPagination || hasEmptyState ? 'fi-ta-ctn-with-footer' : '', hasHeader ? 'fi-ta-ctn-with-header' : '')}>
                    <div className="fi-ta-main">
                        {headerMode === 'hidden' ? (
                            <div className="fi-ta-header-ctn" style={{ display: 'none' }}>
                                <div className="fi-ta-header-toolbar" style={{ display: 'none' }}>
                                    <div className="fi-ta-actions fi-align-start fi-wrapped" />
                                </div>
                            </div>
                        ) : (
                            <TableHeaderCtn mode={headerMode}>
                                {(this._heading || this._description || (headerActions.length > 0 && !reordering)) && (
                                    <div className="fi-ta-header">
                                        {(this._heading || this._description) && (
                                            <div>
                                                {this._heading && <h3 className="fi-ta-header-heading">{this._heading}</h3>}
                                                {this._description && <p className="fi-ta-header-description">{this._description}</p>}
                                            </div>
                                        )}
                                        {!reordering && headerActions.length > 0 && (
                                            <div className="fi-ta-actions fi-align-start fi-wrapped">
                                                {await Promise.all(headerActions.map(async (a, i) => <Fragment key={i}>{await renderActionItem(a, ctx, a instanceof Action ? `table.${this.id}.header.${a.getName()}` : `table.${this.id}.header.g${i}`, { defaultStyle: 'button' })}</Fragment>))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {toolbarMode === 'hidden' ? null : <ToolbarWrapper mode={toolbarMode}>{toolbar}</ToolbarWrapper>}
                            </TableHeaderCtn>
                        )}
                        {reordering ? (
                            <div role="status" aria-live="polite" className="fi-ta-reorder-indicator">
                                {trans('filament-tables::table.reorder_indicator')}
                            </div>
                        ) : isSelectionEnabled && toolbarActions.length > 0 ? (
                            <SelectionIndicator
                                labels={{
                                    one: trans('filament-tables::table.selection_indicator.selected_count').split('|')[0],
                                    other: trans('filament-tables::table.selection_indicator.selected_count').split('|')[1] ?? '',
                                    selectAll: transChoice('filament-tables::table.selection_indicator.actions.select_all.label', allCount, { count: new Intl.NumberFormat(tr.locale.replace('_', '-')).format(allCount) }),
                                    deselectAll: trans('filament-tables::table.selection_indicator.actions.deselect_all.label'),
                                }}
                            />
                        ) : null}
                        {indicators.length > 0 && <FilterIndicators indicators={indicators} prefix={this.prefix} labels={{ heading: trans('filament-tables::table.filters.indicator'), remove: trans('filament-tables::table.filters.actions.remove.label'), removeAll: trans('filament-tables::table.filters.actions.remove_all.label') }} />}
                        <div className="fi-ta-content-ctn fi-fixed-positioning-context">
                            <div role="status" aria-live="polite" aria-atomic="true" className="fi-sr-only">
                                {transChoice('filament-tables::table.result_count', result.total, { count: result.total })}
                            </div>
                            <table aria-label={pluralLabel} className="fi-ta-table">
                                <thead>
                                    <tr>
                                        {records.length > 0 &&
                                            (reordering ? (
                                                <th></th>
                                            ) : (
                                                isSelectionEnabled && (
                                                    <th scope="col" className="fi-ta-cell fi-ta-selection-cell">
                                                        <PageCheckbox label={selectionLabel} />
                                                    </th>
                                                )
                                            ))}
                                        {headerCells}
                                        {!reordering && records.length > 0 && hasRecordActionsForAnyRecord && <th aria-label={transChoice('filament-tables::table.columns.actions.label', flatActionCount)} scope="col" className="fi-ta-actions-header-cell fi-ta-empty-header-cell"></th>}
                                    </tr>
                                </thead>
                                {(this._columns.some((c) => c.isIndividuallySearchable()) || records.length > 0) && <tbody>{rows}</tbody>}
                            </table>
                        </div>
                        {hasEmptyState && (
                            <div className="fi-ta-empty-state" role="status">
                                <div className="fi-ta-empty-state-content">
                                    <div className="fi-ta-empty-state-icon-bg">
                                        <Icon icon={this._emptyIcon} size="lg" />
                                    </div>
                                    <h3 className="fi-ta-empty-state-heading">{emptyHeading}</h3>
                                    {emptyDescription && <p className="fi-ta-empty-state-description">{emptyDescription}</p>}
                                    {await (async () => {
                                        const actions = await visibleOf(this._emptyStateActions);
                                        if (!actions.length) return null;
                                        return (
                                            <div className="fi-ta-actions fi-align-center fi-wrapped">
                                                {await Promise.all(actions.map(async (a, i) => <Fragment key={i}>{await renderActionItem(a, ctx, a instanceof Action ? `table.${this.id}.empty.${a.getName()}` : `table.${this.id}.empty.g${i}`, { defaultStyle: 'button' })}</Fragment>))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                        {pagination}
                    </div>
                </div>
                {modalHostHere && <ModalHost />}
            </TableRoot>
        );
    }

    /** `<x-filament::pagination>` */
    protected async renderPagination(result: Paginated, perPage: number | 'all', pageOptions: string[]): Promise<ReactNode> {
        const { tr } = adminContext();
        const nf = new Intl.NumberFormat(tr.locale.replace('_', '-'));
        const overview = transChoice('filament::components/pagination.overview', result.total, { first: nf.format(result.from ?? 0), last: nf.format(result.to ?? 0), total: nf.format(result.total) });
        const hasPages = result.last_page > 1;
        const onFirst = result.current_page <= 1;
        const hasMore = result.current_page < result.last_page;
        const labels: Record<string, string> = { all: trans('filament::components/pagination.fields.records_per_page.options.all') };
        const elements = hasPages ? paginationElements(result.current_page, result.last_page) : [];
        const item = (key: string, content: { icon?: string; label?: string }, opts: { page?: number; active?: boolean; disabled?: boolean; aria?: string; rel?: string }) => (
            <li key={key} className={cn('fi-pagination-item', opts.disabled && 'fi-disabled', opts.active && 'fi-active')}>
                {opts.disabled ? (
                    <button aria-hidden="true" disabled type="button" className="fi-pagination-item-btn">
                        <span className="fi-pagination-item-label">{content.label}</span>
                    </button>
                ) : (
                    <PageButton page={opts.page!} className="fi-pagination-item-btn" ariaLabel={opts.aria} active={opts.active} rel={opts.rel} label={content.label}>
                        {content.icon && <Icon icon={content.icon} className="fi-pagination-item-icon" aria-hidden="true" />}
                    </PageButton>
                )}
            </li>
        );
        return (
            <nav aria-label={trans('filament::components/pagination.label')} className="fi-pagination">
                {!onFirst && (
                    <PageButton page={result.current_page - 1} rel="prev" className={buttonClass({ color: 'gray', size: 'md', extra: 'fi-pagination-previous-btn' })}>
                        {trans('filament::components/pagination.actions.previous.label')}
                    </PageButton>
                )}
                <span className="fi-pagination-overview">{overview}</span>
                {pageOptions.length > 1 && (
                    <div className="fi-pagination-records-per-page-select-ctn">
                        <label className="fi-pagination-records-per-page-select fi-compact">
                            <div className="fi-input-wrp">
                                <div className="fi-input-wrp-content-ctn">
                                    <PerPageSelect value={String(perPage)} options={pageOptions} labels={labels} />
                                </div>
                            </div>
                            <span className="fi-sr-only">{trans('filament::components/pagination.fields.records_per_page.label')}</span>
                        </label>
                        <label className="fi-pagination-records-per-page-select">
                            <div className="fi-input-wrp">
                                <div className="fi-input-wrp-prefix fi-input-wrp-prefix-has-content fi-input-wrp-prefix-has-label">
                                    <span className="fi-input-wrp-label">{trans('filament::components/pagination.fields.records_per_page.label')}</span>
                                </div>
                                <div className="fi-input-wrp-content-ctn">
                                    <PerPageSelect value={String(perPage)} options={pageOptions} labels={labels} />
                                </div>
                            </div>
                        </label>
                    </div>
                )}
                {hasMore && (
                    <PageButton page={result.current_page + 1} rel="next" className={buttonClass({ color: 'gray', size: 'md', extra: 'fi-pagination-next-btn' })}>
                        {trans('filament::components/pagination.actions.next.label')}
                    </PageButton>
                )}
                {hasPages && (
                    <ol className="fi-pagination-items">
                        {!onFirst && this._extremeLinks && item('first', { icon: 'heroicon-m-chevron-double-left' }, { page: 1, aria: trans('filament::components/pagination.actions.first.label'), rel: 'first' })}
                        {!onFirst && item('prev', { icon: 'heroicon-m-chevron-left' }, { page: result.current_page - 1, aria: trans('filament::components/pagination.actions.previous.label'), rel: 'prev' })}
                        {elements.map((el, i) =>
                            el === '...' ? item(`gap${i}`, { label: '...' }, { disabled: true }) : item(`p${el}`, { label: nf.format(el) }, { page: el, active: el === result.current_page, aria: transChoice('filament::components/pagination.actions.go_to_page.label', el, { page: nf.format(el) }) }),
                        )}
                        {hasMore && item('next', { icon: 'heroicon-m-chevron-right' }, { page: result.current_page + 1, aria: trans('filament::components/pagination.actions.next.label'), rel: 'next' })}
                        {hasMore && this._extremeLinks && item('last', { icon: 'heroicon-m-chevron-double-right' }, { page: result.last_page, aria: trans('filament::components/pagination.actions.last.label'), rel: 'last' })}
                    </ol>
                )}
            </nav>
        );
    }
}

/** the toolbar item of an action: a bulk group is a dropdown, a bulk action hides until records are selected */
async function renderToolbarItem(item: Action | ActionGroup, ctx: ActionContext, id: string): Promise<ReactNode> {
    if (item instanceof BulkActionGroup) {
        const items: ReactNode[] = [];
        let i = 0;
        for (const sub of item.actions) {
            const visible = sub instanceof ActionGroup ? await sub.isVisible(ctx) : await sub.isVisible({ ...ctx, action: sub });
            if (visible) {
                const subId = sub instanceof Action ? `${id.replace(/\.g\d+$/, '')}.${sub.getName()}` : `${id}.g${i}`;
                items.push(<Fragment key={subId}>{await renderActionItem(sub, ctx, subId.replace('.toolbar.', '.bulk.'), { grouped: true, bulk: true })}</Fragment>);
            }
            i++;
        }
        const label = trans('filament-tables::table.actions.open_bulk_actions.label');
        return (
            <ActionDropdown
                bulk
                trigger={
                    <>
                        <button title={label} type="button" className={iconButtonClass({ color: 'gray', size: 'md', extra: 'fi-ac-btn-group' })}>
                            <Icon icon="heroicon-m-ellipsis-vertical" />
                        </button>
                        <button type="button" className={buttonClass({ color: 'gray', size: 'md', labeledFrom: 'sm', extra: 'fi-ac-btn-group' })}>
                            <Icon icon="heroicon-m-ellipsis-vertical" />
                            {label}
                        </button>
                    </>
                }
            >
                <div className="fi-dropdown-list">{items}</div>
            </ActionDropdown>
        );
    }
    return renderActionItem(item, ctx, id.replace('.toolbar.', item instanceof Action && item.isBulk() ? '.bulk.' : '.toolbar.'), { defaultStyle: 'button', bulk: item instanceof Action ? item.isBulk() : false });
}

export { badgeClass };
