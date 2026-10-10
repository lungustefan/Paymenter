import type { CSSProperties, ReactNode } from 'react';
import { Component, type RenderContext } from './Component';
import { Action, ActionGroup } from '../actions/Action';
import { renderActionItem } from '../actions/render';
import { gridColumnProps, gridProps, resolveColumns, resolveSpan, type Breakpoints } from '../ui/grid';
import { setPath } from '../core/evaluate';

export type SchemaItem = Component | Action | ActionGroup;

/** `<div class="fi-grid fi-sc ...">` - a schema container */
export function SchemaGrid({ columns, className = '', extra, inline, alignment, gap = true, dense, style, children, id }: { columns: Breakpoints<number | null>; className?: string; extra?: Record<string, any>; inline?: boolean; alignment?: string | null; gap?: boolean; dense?: boolean; style?: CSSProperties; children: ReactNode; id?: string }) {
    const grid = inline ? { className: '', style: {} } : gridProps(columns);
    const classes = [grid.className, 'fi-sc', inline ? 'fi-inline' : '', alignment ? `fi-align-${alignment}` : '', gap ? 'fi-sc-has-gap' : '', dense ? 'fi-sc-dense' : '', className].filter(Boolean).join(' ');
    return (
        <div id={id} {...extra} className={classes} style={{ ...grid.style, ...style }}>
            {children}
        </div>
    );
}

/** `Component::toSchemaHtml()`: the `fi-grid-col` wrapper around every component of a schema */
export function SchemaCell({ component, visible, inline, children }: { component: Component; visible: boolean; inline?: boolean; children?: ReactNode }) {
    const span = resolveSpan(component.getColumnSpan() as any);
    const start = toBreakpoints(component.getColumnStart());
    const order = toBreakpoints(component.getColumnOrder());
    const col = inline ? { className: '', style: {} } : gridColumnProps(span as any, start, order, !visible);
    const maxWidth = component.getMaxWidth();
    const classes = [col.className, maxWidth ? `fi-width-${maxWidth}` : ''].filter(Boolean).join(' ');
    return (
        <div className={classes} style={col.style}>
            {visible && <div className={`fi-sc-component${component.isGridContainer() ? ' fi-grid-ctn' : ''}`}>{children}</div>}
        </div>
    );
}

const toBreakpoints = (v: number | Breakpoints<number> | undefined): Breakpoints<number> => (v === undefined ? {} : typeof v === 'number' ? { default: v } : v);

/** Renders a list of schema items (components, actions) into their grid. */
export async function renderItems(rc: RenderContext, items: SchemaItem[], options: { columns?: number | Breakpoints<number | null> | null; className?: string; extra?: Record<string, any>; inline?: boolean; alignment?: string | null; gap?: boolean; dense?: boolean; id?: string; style?: CSSProperties } = {}): Promise<ReactNode> {
    const rendered: Array<{ item: SchemaItem; visible: boolean }> = [];
    let any = false;
    for (const item of items) {
        const visible = item instanceof Component ? await item.isVisible(rc) : await item.isVisible({ ...(await actionCtx(rc, item)) });
        if (visible) any = true;
        rendered.push({ item, visible });
    }
    if (!any) return null;
    const cells: ReactNode[] = [];
    let index = 0;
    for (const { item, visible } of rendered) {
        const key = item instanceof Component ? (item.getKey() ?? `c${index}`) : `a${index}`;
        index++;
        if (item instanceof Component) {
            cells.push(
                <SchemaCell key={key} component={item} visible={visible} inline={options.inline}>
                    {visible ? await item.render(rc) : null}
                </SchemaCell>,
            );
        } else {
            cells.push(
                <div key={key} className={`fi-sc-action${visible ? '' : ' fi-hidden'}`}>
                    {visible ? await renderActionItem(item, await actionCtx(rc, item), `schema.${key}`) : null}
                </div>,
            );
        }
    }
    return (
        <SchemaGrid columns={resolveColumns(options.columns as any)} className={options.className} extra={options.extra} inline={options.inline} alignment={options.alignment} gap={options.gap} dense={options.dense} id={options.id} style={options.style}>
            {cells}
        </SchemaGrid>
    );
}

async function actionCtx(rc: RenderContext, item: Action | ActionGroup) {
    void item;
    return { get: (p: string) => rc.state[p], set: (p: string, v: unknown) => setPath(rc.state, p, v), record: rc.record, operation: rc.operation, user: rc.user, livewire: rc.livewire, ...rc.extra } as any;
}

/**
 * Port of Filament\Schemas\Schema: a list of components with a grid layout, a state path, and the
 * default state / validation rules / dehydration derived from them.
 */
export class Schema {
    protected _components: SchemaItem[] = [];
    protected _columns?: number | Breakpoints<number | null> | null;
    protected _statePath: string | null = null;
    protected _extra: Record<string, any> = {};
    protected _inline = false;
    protected _alignment: string | null = null;
    protected _gap = true;
    protected _dense = false;
    protected _operation?: string;
    protected _model?: any;
    protected _record?: any;

    static make(): Schema {
        return new Schema();
    }

    components(list: SchemaItem[]) {
        this._components = list;
        for (const c of list) if (c instanceof Component) c.parent = c.parent ?? null;
        return this;
    }
    schema(list: SchemaItem[]) {
        return this.components(list);
    }
    /** `columns(2)` is `lg: 2`; calls merge into the earlier ones like `HasColumns::columns()` */
    columns(v: number | Breakpoints<number | null> | null) {
        const given: Breakpoints<number | null> = typeof v === 'number' ? { lg: v } : v === null ? { lg: null } : v;
        this._columns = { ...(typeof this._columns === 'object' && this._columns ? this._columns : {}), ...given };
        return this;
    }
    statePath(v: string | null) {
        this._statePath = v;
        return this;
    }
    extraAttributes(v: Record<string, any>) {
        this._extra = v;
        return this;
    }
    inline(v = true) {
        this._inline = v;
        return this;
    }
    alignment(v: string | null) {
        this._alignment = v;
        return this;
    }
    gap(v = true) {
        this._gap = v;
        return this;
    }
    dense(v = true) {
        this._dense = v;
        return this;
    }
    operation(v: string) {
        this._operation = v;
        return this;
    }
    model(v: any) {
        this._model = v;
        return this;
    }
    record(v: any) {
        this._record = v;
        return this;
    }

    getComponents(): SchemaItem[] {
        return this._components;
    }
    hasCustomColumns() {
        return this._columns !== undefined;
    }
    getOperation() {
        return this._operation;
    }
    getStatePath() {
        return this._statePath;
    }
    /** the form components only (no actions) */
    getFlatComponents(): Component[] {
        return this._components.filter((c): c is Component => c instanceof Component);
    }

    /** every field below this schema, depth first (layouts included) */
    getAllComponents(): Component[] {
        const out: Component[] = [];
        const walk = (list: Component[]) => {
            for (const c of list) {
                out.push(c);
                walk(c.getChildComponents());
            }
        };
        walk(this.getFlatComponents());
        return out;
    }

    async render(rc: RenderContext): Promise<ReactNode> {
        return renderItems(rc, this._components, { columns: this._columns, extra: this._extra, inline: this._inline, alignment: this._alignment, gap: this._gap, dense: this._dense });
    }

    findByStatePath(rc: RenderContext, path: string): Component | null {
        for (const c of this.getFlatComponents()) {
            const found = c.findByStatePath(rc, path);
            if (found) return found;
        }
        return null;
    }

    async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true) {
        for (const c of this.getFlatComponents()) await c.hydrateDefaults(rc, state, applyDefaults);
    }

    async loadRelationshipState(rc: RenderContext, record: any, state: Record<string, any>) {
        for (const c of this.getFlatComponents()) await c.loadRelationshipState(rc, record, state);
    }

    async saveRelationships(rc: RenderContext, record: any, data: Record<string, any>) {
        for (const c of this.getFlatComponents()) await c.saveRelationships(rc, record, data);
    }

    async collectRules(rc: RenderContext, rules: Record<string, any[]>, attributes: Record<string, string>) {
        for (const c of this.getFlatComponents()) await c.collectRules(rc, rules, attributes);
    }

    async dehydrate(rc: RenderContext): Promise<Record<string, any>> {
        const out: Record<string, any> = {};
        for (const c of this.getFlatComponents()) await c.dehydrate(rc, out);
        return out;
    }
}

export { gridColumnProps, gridProps };
