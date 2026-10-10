import type { ReactNode } from 'react';
import { sql } from 'drizzle-orm';
import { evaluate, type EvalContext, type Fn } from '../../core/evaluate';
import type { Builder } from '@/server/orm';
import type { Table } from '../Table';
import { dbValue } from '../../core/attributes';

export interface ColumnContext extends EvalContext {
    column: Column;
    table: Table;
    /** `$rowLoop` */
    rowLoop?: { index: number; iteration: number; first: boolean; last: boolean; count: number };
    recordKey?: string;
    [key: string]: any;
}

export type CFn<T> = Fn<T, ColumnContext>;

export type Alignment = 'start' | 'center' | 'end' | 'left' | 'right' | 'justify' | 'between';

/** `str($name)->camel()->kebab()` used for the `fi-ta-cell-<name>` classes */
export const kebabName = (name: string) =>
    name
        .replace(/[\s_-]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))
        .replace(/^(.)/, (c) => c.toLowerCase())
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();

/**
 * Port of Filament\Tables\Columns\Column: what a table column knows about its state, searching,
 * sorting, visibility and layout. Subclasses render the content of a cell.
 */
export abstract class Column {
    protected _label?: CFn<string | null>;
    protected _sortable: CFn<boolean> = false;
    protected _sortColumns: string[] | null = null;
    protected _sortQuery?: (ctx: { query: Builder<any>; direction: 'asc' | 'desc' }) => void;
    protected _searchable: CFn<boolean> = false;
    protected _searchColumns: string[] | null = null;
    protected _searchQuery?: (ctx: { query: Builder<any>; search: string }) => void | Builder<any>;
    protected _individuallySearchable = false;
    protected _globallySearchable = true;
    protected _toggleable = false;
    protected _toggledHiddenByDefault = false;
    protected _alignment?: CFn<Alignment | string | null>;
    protected _verticalAlignment?: string;
    protected _width?: string;
    protected _grow?: boolean;
    protected _headerWrap = false;
    protected _hidden: CFn<boolean> = false;
    protected _visible: CFn<boolean> = true;
    protected _hiddenFrom?: string;
    protected _visibleFrom?: string;
    protected _url?: CFn<string | null>;
    protected _openUrlInNewTab = false;
    protected _action?: ((ctx: ColumnContext) => any) | string;
    protected _clickDisabled = false;
    protected _stateUsing?: (ctx: ColumnContext) => any;
    protected _default?: CFn<any>;
    protected _placeholder?: CFn<string | null>;
    protected _tooltip?: CFn<string | null>;
    protected _extraAttributes: Record<string, any> = {};
    protected _extraCellAttributes: Record<string, any> = {};
    protected _extraHeaderAttributes: Record<string, any> = {};
    protected _headerTooltip?: string;
    protected _inline = false;
    /** the table the column belongs to (set by the table) */
    table!: Table;

    constructor(public name: string) {}

    static make<T extends Column>(this: new (name: string) => T, name: string): T {
        return new this(name);
    }

    /* ---- fluent configuration ---- */
    label(v: CFn<string | null>) { this._label = v; return this; }
    sortable(condition: boolean | string[] | CFn<boolean> = true, query?: (ctx: { query: Builder<any>; direction: 'asc' | 'desc' }) => void) {
        if (Array.isArray(condition)) {
            this._sortable = true;
            this._sortColumns = condition;
        } else {
            this._sortable = condition;
            this._sortColumns = null;
        }
        this._sortQuery = query;
        return this;
    }
    searchable(condition: boolean | string | string[] | CFn<boolean> = true, query?: (ctx: { query: Builder<any>; search: string }) => void | Builder<any>, isIndividual = false, isGlobal = true) {
        if (typeof condition === 'boolean' || typeof condition === 'function') {
            this._searchable = condition as any;
            this._searchColumns = null;
        } else {
            this._searchable = true;
            this._searchColumns = Array.isArray(condition) ? condition : [condition];
        }
        this._searchQuery = query;
        this._individuallySearchable = isIndividual;
        this._globallySearchable = isGlobal;
        return this;
    }
    toggleable(condition = true, isToggledHiddenByDefault = false) { this._toggleable = condition; this._toggledHiddenByDefault = isToggledHiddenByDefault; return this; }
    toggledHiddenByDefault(v = true) { this._toggledHiddenByDefault = v; return this; }
    alignment(v: CFn<Alignment | string | null>) { this._alignment = v; return this; }
    alignStart() { return this.alignment('start'); }
    alignCenter() { return this.alignment('center'); }
    alignEnd() { return this.alignment('end'); }
    alignRight() { return this.alignment('end'); }
    verticalAlignment(v: string) { this._verticalAlignment = v; return this; }
    width(v: string) { this._width = v; return this; }
    grow(v = true) { this._grow = v; return this; }
    wrapHeader(v = true) { this._headerWrap = v; return this; }
    hidden(v: CFn<boolean> = true) { this._hidden = v; return this; }
    visible(v: CFn<boolean> = true) { this._visible = v; return this; }
    hiddenFrom(v: string) { this._hiddenFrom = v; return this; }
    visibleFrom(v: string) { this._visibleFrom = v; return this; }
    url(v: CFn<string | null>, shouldOpenInNewTab = false) { this._url = v; this._openUrlInNewTab = shouldOpenInNewTab; return this; }
    openUrlInNewTab(v = true) { this._openUrlInNewTab = v; return this; }
    action(v: ((ctx: ColumnContext) => any) | string) { this._action = v; return this; }
    disabledClick(v = true) { this._clickDisabled = v; return this; }
    /** `->state(fn)` / `->getStateUsing(fn)` */
    state(v: ((ctx: ColumnContext) => any) | any) { this._stateUsing = typeof v === 'function' ? v : () => v; return this; }
    getStateUsing(v: (ctx: ColumnContext) => any) { this._stateUsing = v; return this; }
    default(v: CFn<any>) { this._default = v; return this; }
    placeholder(v: CFn<string | null>) { this._placeholder = v; return this; }
    tooltip(v: CFn<string | null>) { this._tooltip = v; return this; }
    headerTooltip(v: string) { this._headerTooltip = v; return this; }
    extraAttributes(v: Record<string, any>) { this._extraAttributes = v; return this; }
    extraCellAttributes(v: Record<string, any>) { this._extraCellAttributes = v; return this; }
    extraHeaderAttributes(v: Record<string, any>) { this._extraHeaderAttributes = v; return this; }
    inline(v = true) { this._inline = v; return this; }

    /* ---- evaluation ---- */
    ctx(record: any, extra: Record<string, any> = {}): ColumnContext {
        return { record, column: this, table: this.table, livewire: this.table?.livewire, user: this.table?.user, get: () => undefined, set: () => undefined, ...extra };
    }

    protected ev<T>(v: CFn<T> | undefined, ctx: ColumnContext): Promise<T | undefined> {
        return evaluate<T, ColumnContext>(v, ctx);
    }

    getName() { return this.name; }

    getLabel(): string {
        if (typeof this._label === 'string') return this._label;
        // `str($name)->afterLast('.')->kebab()->replace(['-', '_'], ' ')->ucfirst()`
        const last = this.name.split('.').pop() as string;
        const words = last.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[-_]+/g, ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    async getLabelFor(record: any = null): Promise<string> {
        if (typeof this._label === 'function') return ((await this.ev(this._label, this.ctx(record))) as string) ?? this.getLabel();
        return this.getLabel();
    }

    isSortable() { return typeof this._sortable === 'boolean' ? this._sortable : true; }
    isSearchable() { return typeof this._searchable === 'boolean' ? this._searchable : true; }
    isGloballySearchable() { return this.isSearchable() && this._globallySearchable; }
    isIndividuallySearchable() { return this.isSearchable() && this._individuallySearchable; }
    isToggleable() { return this._toggleable; }
    isToggledHiddenByDefault() { return this._toggledHiddenByDefault; }
    getWidth() { return this._width; }
    canGrow() { return this._grow; }
    canHeaderWrap() { return this._headerWrap; }
    getHiddenFrom() { return this._hiddenFrom; }
    getVisibleFrom() { return this._visibleFrom; }
    getHeaderTooltip() { return this._headerTooltip; }
    getExtraHeaderAttributes() { return this._extraHeaderAttributes; }
    getExtraCellAttributes() { return this._extraCellAttributes; }
    getVerticalAlignment() { return this._verticalAlignment; }
    hasAction() { return this._action !== undefined; }
    isClickDisabled() { return this._clickDisabled; }
    shouldOpenUrlInNewTab() { return this._openUrlInNewTab; }
    hasUrl() { return this._url !== undefined; }

    async getAlignment(record: any = null): Promise<string | null> {
        const a = await this.ev(this._alignment, this.ctx(record));
        return (a as string | null) ?? null;
    }

    async isHidden(record: any = null): Promise<boolean> {
        const ctx = this.ctx(record);
        if ((await this.ev(this._hidden, ctx)) === true) return true;
        return (await this.ev(this._visible, ctx)) === false;
    }

    async getUrl(record: any, state?: any): Promise<string | null> {
        return ((await this.ev(this._url, this.ctx(record, { state }))) as string | null | undefined) ?? null;
    }

    async getTooltip(record: any, state?: any): Promise<string | null> {
        return ((await this.ev(this._tooltip, this.ctx(record, { state }))) as string | null | undefined) ?? null;
    }

    /* ---- state ---- */
    /** names of the relations the cell reads (`user.name` -> `user`), eager loaded for the page */
    getEagerLoads(model: any): string[] {
        const parts = this.name.split('.');
        const loads: string[] = [];
        for (let i = 1; i < parts.length; i++) {
            const candidate = parts.slice(0, i).join('.');
            const first = parts[0];
            if (model?.relations?.[first]) loads.push(candidate);
            else break;
        }
        return loads.length ? [loads[loads.length - 1]] : [];
    }

    /** `data_get($record, $name)` with relations (`user.name`) and accessors */
    async resolveAttribute(record: any, path = this.name): Promise<any> {
        let current: any = record;
        for (const segment of path.split('.')) {
            if (current === null || current === undefined) return null;
            if (Array.isArray(current)) {
                current = (await Promise.all(current.map(async (item) => this.readSegment(item, segment)))).flat();
                continue;
            }
            current = await this.readSegment(current, segment);
        }
        return current;
    }

    private async readSegment(item: any, segment: string): Promise<any> {
        if (item === null || item === undefined) return null;
        if (typeof item.relationDef === 'function' && item.relationDef(segment)) return item.rel(segment);
        if (typeof item.getAttribute === 'function') return dbValue(item, segment, await item.getAttribute(segment));
        return item[segment];
    }

    async getState(record: any): Promise<any> {
        let state: any;
        if (this._stateUsing) state = await this._stateUsing(this.ctx(record));
        else state = await this.resolveAttribute(record);
        if ((state === null || state === undefined || (Array.isArray(state) && state.length === 0)) && this._default !== undefined) state = await this.ev(this._default, this.ctx(record));
        return state;
    }

    /* ---- query ---- */
    /** columns searched in the database (`getSearchColumns()`) */
    getSearchColumns(): string[] {
        return this._searchColumns ?? [this.name.split('.').pop() as string];
    }

    /** `applySearchConstraint()` */
    applySearchConstraint(query: Builder<any>, search: string, isFirst: { value: boolean }): void {
        if (this._searchQuery) {
            const method = isFirst.value ? 'where' : 'orWhere';
            (query as any)[method]((q: Builder<any>) => void this._searchQuery!({ query: q, search }));
            isFirst.value = false;
            return;
        }
        const model = query.model as any;
        const relation = this.relationName(model);
        for (const column of this.getSearchColumns()) {
            const method = isFirst.value ? 'where' : 'orWhere';
            const like = `%${search.toLowerCase()}%`;
            if (relation) {
                (query as any)[method]((q: Builder<any>) => q.whereHas(relation, (r: Builder<any>) => r.where(column, 'like', like)));
            } else {
                (query as any)[method](column, 'like', like);
            }
            isFirst.value = false;
        }
    }

    /** the relation of a `user.name` column (when `user` is one) */
    protected relationName(model: any): string | null {
        const parts = this.name.split('.');
        if (parts.length < 2) return null;
        return model?.relations?.[parts[0]] ? parts.slice(0, -1).join('.') : null;
    }

    /** `applySort()` */
    applySort(query: Builder<any>, direction: 'asc' | 'desc'): void {
        if (this._sortQuery) {
            this._sortQuery({ query, direction });
            return;
        }
        const model = query.model as any;
        const relation = this.relationName(model);
        const columns = this._sortColumns ?? [this.name.split('.').pop() as string];
        for (const column of [...columns].reverse()) {
            if (relation) {
                const def = model.relations[relation];
                if (def?.columnSubquery) {
                    query.orderByRaw(sql`${def.columnSubquery(model, column)} ${sql.raw(direction)}`);
                    continue;
                }
            }
            query.orderBy(column, direction);
        }
    }

    /** `getCellAttributeHtml()` classes */
    async cellClasses(record: any): Promise<string[]> {
        const alignment = await this.getAlignment(record);
        const vertical = this._verticalAlignment;
        return [
            'fi-ta-cell',
            `fi-ta-cell-${kebabName(this.name)}`,
            alignment ? (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(alignment) ? `fi-align-${alignment}` : alignment) : '',
            vertical ? `fi-vertical-align-${vertical}` : '',
            this._hiddenFrom ? `${this._hiddenFrom}:fi-hidden` : '',
            this._visibleFrom ? `${this._visibleFrom}:fi-visible` : '',
        ].filter(Boolean);
    }

    /** the content of a cell (`{{ $column }}`) */
    abstract render(record: any, ctx: { recordKey: string; rowLoop: ColumnContext['rowLoop'] }): Promise<ReactNode>;
}
