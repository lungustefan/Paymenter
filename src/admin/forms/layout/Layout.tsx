import type { ReactNode } from 'react';
import { Component, type RenderContext } from '../Component';
import { renderItems, type SchemaItem } from '../Schema';
import type { Fn } from '../../core/evaluate';
import type { Breakpoints } from '../../ui/grid';

/** `Str::slug(Str::transliterate($text))` */
export function slug(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Base of the layout components (Section, Grid, Tabs, ...): they hold a child schema, which may be
 * a closure (`schema(fn ($get) => [...])`) evaluated on every render.
 */
export abstract class Layout extends Component {
    protected _schema: Fn<SchemaItem[]> = [];
    /** columns of the grid this component sits in (set while the parent renders it) */
    containerColumns?: Breakpoints<number | null> = undefined;

    constructor(key?: string | null) {
        super(key);
    }

    schema(v: Fn<SchemaItem[]>) { this._schema = v; return this; }
    components(v: Fn<SchemaItem[]>) { return this.schema(v); }

    override hasStatePath() { return false; }

    async getItems(rc: RenderContext): Promise<SchemaItem[]> {
        const items = ((await this.ev(this._schema, rc)) ?? []) as SchemaItem[];
        for (const i of items) if (i instanceof Component) i.parent = this;
        return items;
    }

    override getChildComponents(): Component[] {
        // static schemas are walked synchronously (state defaults, rules); closures need `getChildren(rc)`
        return Array.isArray(this._schema) ? (this._schema.filter((c) => c instanceof Component) as Component[]) : [];
    }

    override async getChildren(rc: RenderContext): Promise<Component[]> {
        return (await this.getItems(rc)).filter((c): c is Component => c instanceof Component);
    }

    /** the id Filament derives for a keyed layout component (`form.<slug>::data::section`) */
    protected domId(rc: RenderContext, label: string | null | undefined, suffix: string): string | undefined {
        if (this._id) return this._id;
        if (!label) return undefined;
        return `${rc.formId}.${slug(label)}::${rc.extra.domStatePath ?? 'data'}::${suffix}`;
    }

    protected async renderSchema(rc: RenderContext, options: { columns?: number | Breakpoints<number | null> | null; className?: string; extra?: Record<string, any> } = {}): Promise<ReactNode> {
        const items = await this.getItems(rc);
        return renderItems(rc, items, { columns: options.columns ?? this.getColumns() ?? this.containerColumns, className: options.className, extra: options.extra });
    }
}
