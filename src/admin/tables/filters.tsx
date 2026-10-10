import type { ReactNode } from 'react';
import type { Builder } from '@/server/orm';
import { Component, type RenderContext } from '../forms/Component';
import { renderItems } from '../forms/Schema';
import { Select, normalizeOptions, type OptionsInput } from '../forms/fields/Select';
import { Checkbox } from '../forms/fields/Checkbox';
import { Toggle } from '../forms/fields/Toggle';
import { makeRenderContext } from '../forms/process';
import { evaluate, type Fn } from '../core/evaluate';
import { adminContext, trans } from '../context';
import type { Table } from './Table';
import { FiltersPanel as FiltersPanelClient } from './client-extra';
import { gridColumnProps } from '../ui/grid';

/** `true` / `false` / `'1'` / `'0'` from the query string */
const asBool = (v: unknown) => v === true || v === '1' || v === 'true' || v === 1;

/** a filter's form: `<div id="tableFiltersForm.<name>">` around its fields, in the state of the filter */
class FilterGroup extends Component {
    constructor(
        private filterName: string,
        private fields: Component[],
    ) {
        super(filterName);
        for (const f of fields) f.parent = this;
    }
    override getChildComponents() {
        return this.fields;
    }
    override async render(rc: RenderContext): Promise<ReactNode> {
        const inner = { ...rc, container: this.filterName };
        const grid = await renderItems(inner, this.fields, { columns: { default: 1 } });
        return <div id={`${rc.formId}.${this.filterName}`}>{grid}</div>;
    }
}

export interface FilterContext {
    data: Record<string, any>;
    state: Record<string, any>;
    query?: Builder<any>;
    filter: BaseFilter;
    table: Table;
    [key: string]: any;
}

/** Port of Filament\Tables\Filters\BaseFilter */
export abstract class BaseFilter {
    table!: Table;
    protected _label?: string;
    protected _query?: (ctx: FilterContext) => void | Builder<any>;
    protected _indicateUsing?: (ctx: FilterContext) => string | string[] | null | undefined | false;
    protected _indicator?: string;
    protected _default: any = undefined;
    protected _schema?: Fn<Component[]>;
    protected _hidden: Fn<boolean> = false;
    protected _columnSpan = 1;

    constructor(public name: string) {}

    static make<T extends BaseFilter>(this: new (name: string) => T, name: string): T {
        return new this(name);
    }

    label(v: string) { this._label = v; return this; }
    query(fn: (ctx: FilterContext) => void | Builder<any>) { this._query = fn; return this; }
    /** `->form([...])` / `->schema([...])` */
    form(v: Fn<Component[]>) { this._schema = v; return this; }
    schema(v: Fn<Component[]>) { return this.form(v); }
    indicateUsing(fn: (ctx: FilterContext) => string | string[] | null | undefined | false) { this._indicateUsing = fn; return this; }
    indicator(v: string) { this._indicator = v; return this; }
    default(v: any) { this._default = v; return this; }
    hidden(v: Fn<boolean> = true) { this._hidden = v; return this; }
    columnSpan(v: number) { this._columnSpan = v; return this; }

    getName() { return this.name; }
    getLabel(): string {
        if (this._label) return this._label;
        // `str($name)->replace('_', ' ')->ucfirst()` after `headline`
        const words = this.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
    getIndicator(): string {
        return this._indicator ?? this.getLabel();
    }
    getColumnSpan() {
        return this._columnSpan;
    }

    /** the stored state of the filter (from the URL), with its defaults */
    abstract getState(all: Record<string, any>): Record<string, any>;

    /** the fields of the filter's form */
    abstract getFormSchema(rc: RenderContext): Promise<Component[]>;

    async isHidden(): Promise<boolean> {
        return (await evaluate(this._hidden, { get: () => undefined, set: () => undefined } as any)) === true;
    }

    protected ctx(data: Record<string, any>, query?: Builder<any>): FilterContext {
        return { data, state: data, query, filter: this, table: this.table, livewire: this.table?.livewire, user: this.table?.user, get: () => undefined, set: () => undefined };
    }

    /** `apply(Builder $query, array $data)` */
    async apply(query: Builder<any>, data: Record<string, any>): Promise<void> {
        if (!this._query) return;
        if (data.isActive === false) return;
        await this._query(this.ctx(data, query));
    }

    async applyTo(query: Builder<any>, all: Record<string, any>): Promise<void> {
        if (await this.isHidden()) return;
        await this.apply(query, this.getState(all));
    }

    async getIndicators(all: Record<string, any>): Promise<string[]> {
        if (!this._indicateUsing) return [];
        const out = this._indicateUsing(this.ctx(this.getState(all)));
        const resolved = await out;
        if (!resolved) return [];
        return (Array.isArray(resolved) ? resolved : [resolved]).filter(Boolean) as string[];
    }

    async getActiveCount(all: Record<string, any>): Promise<number> {
        return (await this.getIndicators(all)).length;
    }
}

/** Filament\Tables\Filters\Filter: a checkbox / toggle, or any form */
export class Filter extends BaseFilter {
    protected _formComponent: 'checkbox' | 'toggle' = 'checkbox';

    constructor(name: string) {
        super(name);
        this._indicateUsing = ({ state }) => (state.isActive ? this.getIndicator() : []);
    }

    toggle() { this._formComponent = 'toggle'; return this; }
    checkbox() { this._formComponent = 'checkbox'; return this; }

    getState(all: Record<string, any>): Record<string, any> {
        const raw = { ...(all[this.name] ?? {}) };
        if (!this._schema) {
            if (raw.isActive === undefined && this._default !== undefined) raw.isActive = this._default;
            raw.isActive = asBool(raw.isActive);
        } else if (this._default && typeof this._default === 'object') {
            for (const [k, v] of Object.entries(this._default)) if (raw[k] === undefined) raw[k] = v;
        }
        return raw;
    }

    async getFormSchema(rc: RenderContext): Promise<Component[]> {
        if (this._schema) return (await evaluate(this._schema, {} as any)) ?? [];
        const field = this._formComponent === 'toggle' ? Toggle.make('isActive') : Checkbox.make('isActive');
        field.label(this.getLabel());
        void rc;
        return [field];
    }
}

/** Filament\Tables\Filters\SelectFilter */
export class SelectFilter extends BaseFilter {
    protected _options?: Fn<OptionsInput>;
    protected _multiple = false;
    protected _searchable = false;
    protected _preload = false;
    protected _relationship: { name: string; title: string; modify?: (q: Builder<any>) => void } | null = null;
    protected _attribute?: string;
    protected _placeholder?: string;
    protected _optionLabelFromRecord?: (record: any) => string;
    protected _native = true;
    protected _selectablePlaceholder = true;

    options(v: Fn<OptionsInput>) { this._options = v; return this; }
    multiple(v = true) { this._multiple = v; return this; }
    searchable(v = true) { this._searchable = v; return this; }
    preload(v = true) { this._preload = v; return this; }
    attribute(v: string) { this._attribute = v; return this; }
    column(v: string) { return this.attribute(v); }
    native(v = true) { this._native = v; return this; }
    placeholder(v: string) { this._placeholder = v; return this; }
    selectablePlaceholder(v = true) { this._selectablePlaceholder = v; return this; }
    getOptionLabelFromRecordUsing(fn: (record: any) => string) { this._optionLabelFromRecord = fn; return this; }
    relationship(name: string, title: string, modify?: (q: Builder<any>) => void) {
        this._relationship = { name, title, modify };
        return this;
    }

    private key() {
        return this._multiple ? 'values' : 'value';
    }

    getState(all: Record<string, any>): Record<string, any> {
        const raw = { ...(all[this.name] ?? {}) };
        if (this._multiple) {
            const v = raw.values;
            raw.values = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : v ? [v] : [];
        } else raw.value = raw.value ?? this._default ?? null;
        return raw;
    }

    private async labels(values: Array<string | number>, rc?: RenderContext): Promise<string[]> {
        if (this._relationship) {
            const Model = (this.table.model as any).relations[this._relationship.name].related();
            const key = Model.primaryKey ?? 'id';
            const rows = await Model.query().whereIn(key, values as any[]).get();
            return Promise.all(rows.map(async (r: any) => (this._optionLabelFromRecord ? this._optionLabelFromRecord(r) : String(r[this._relationship!.title]))));
        }
        void rc;
        const all = normalizeOptions(await evaluate(this._options, {} as any));
        const flat = all.flatMap((e) => ('group' in e ? e.options : [e]));
        return values.map((v) => flat.find((o) => o.value === String(v))?.label).filter(Boolean) as string[];
    }

    override async apply(query: Builder<any>, data: Record<string, any>): Promise<void> {
        if (this._query) return super.apply(query, data);
        const values = this._multiple ? data.values : data.value;
        const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== null && v !== undefined && v !== '');
        if (list.length === 0) return;
        if (!this._relationship) {
            const column = this._attribute ?? this.name;
            if (this._multiple) query.whereIn(column, list);
            else query.where(column, list[0]);
            return;
        }
        const Model = (this.table.model as any).relations[this._relationship.name].related();
        const key = Model.primaryKey ?? 'id';
        query.whereHas(this._relationship.name, (q: Builder<any>) => {
            this._relationship!.modify?.(q);
            if (this._multiple) q.whereIn(key, list);
            else q.where(key, list[0]);
        });
    }

    override async getIndicators(all: Record<string, any>): Promise<string[]> {
        if (this._indicateUsing) return super.getIndicators(all);
        const state = this.getState(all);
        const values = this._multiple ? state.values : state.value;
        const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== null && v !== undefined && v !== '');
        if (!list.length) return [];
        const labels = await this.labels(list);
        if (!labels.length) return [];
        const joined = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}` : labels[0];
        return [`${this.getIndicator()}: ${joined}`];
    }

    async getFormSchema(): Promise<Component[]> {
        const field = Select.make(this.key())
            .label(this.getLabel())
            .multiple(this._multiple)
            .placeholder(this._placeholder ?? trans(this._multiple ? 'filament-tables::table.filters.multi_select.placeholder' : 'filament-tables::table.filters.select.placeholder'))
            .searchable(this._searchable)
            .selectablePlaceholder(this._selectablePlaceholder)
            .preload(this._preload)
            .native(this._native);
        if (this._relationship) {
            const rel = this._relationship;
            const table = this.table;
            // the relationship lives on the table's model, not on the form's
            field.relationship(rel.name, rel.title, rel.modify ? (q: Builder<any>) => rel.modify!(q) : undefined);
            if (this._optionLabelFromRecord) field.getOptionLabelFromRecordUsing(this._optionLabelFromRecord);
            (field as any).tableModel = table.model;
        } else field.options(this._options ?? []);
        return [field];
    }
}

/** the whole filters form, rendered once for the dropdown of the toolbar */
export async function renderFiltersForm(table: Table, state: Record<string, any>, columns: number): Promise<{ node: ReactNode; initial: Record<string, any> }> {
    const { user } = adminContext();
    const rc = makeRenderContext({ state: {}, operation: 'filter', user, livewire: table.livewire, formId: 'tableFiltersForm', model: table.model });
    const initial: Record<string, any> = {};
    const groups: Component[] = [];
    for (const filter of table.getFilters()) {
        if (await filter.isHidden()) continue;
        const fields = await filter.getFormSchema(rc);
        initial[filter.getName()] = filter.getState(state);
        groups.push(new FilterGroup(filter.getName(), fields));
    }
    rc.state = initial;
    // fields that have no stored value yet get their empty state
    for (const g of groups) await g.hydrateDefaults({ ...rc, container: '' }, rc.state, true);
    const cells = await Promise.all(
        groups.map(async (g, i) => {
            const col = gridColumnProps({ default: 1, lg: 1 }, {}, {}, false);
            return (
                <div key={i} className={col.className} style={col.style}>
                    <div className="fi-sc-component">{await g.render(rc)}</div>
                </div>
            );
        }),
    );
    const grid = (await import('../ui/grid')).gridProps({ lg: columns, default: 1 });
    return {
        node: (
            <div className={`${grid.className} fi-sc fi-sc-has-gap`} style={grid.style}>
                {cells}
            </div>
        ),
        initial: rc.state,
    };
}

export { FiltersPanelClient as FiltersPanel };
