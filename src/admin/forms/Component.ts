import type { ReactNode } from 'react';
import type { Model } from '@/server/orm';
import type { User } from '@/server/models/User';
import { evaluate, getPath, resolvePath, setPath, type EvalContext, type Fn } from '../core/evaluate';

/** What a component needs while it is rendered / validated / saved. */
export interface RenderContext {
    /** the whole state of the form (`data`) - mutated by `$set` */
    state: Record<string, any>;
    errors: Record<string, string[]>;
    operation: string;
    record: Model<any> | null;
    /** model class the form edits (for relationship fields) */
    model?: any;
    user: User;
    /** the page / table / action the form belongs to */
    livewire: any;
    /** id prefix of the DOM nodes (`form`) */
    formId: string;
    /** state path of the container the component is rendered in */
    container: string;
    /** extra values closures may ask for (`$arguments`, `$ownerRecord`, ...) */
    extra: Record<string, any>;
    /** the paths whose `afterStateUpdated` should run (a live update) */
    changedPath?: string | null;
}

export type ColumnSpan = number | 'full' | Record<string, number | 'full' | null>;

/**
 * Base of every form / layout component. Options are stored as value-or-closure and resolved with
 * the rendering context (`$get`, `$set`, `$record`, `$operation`, ...).
 */
export abstract class Component {
    protected _key: string | null = null;
    protected _label?: Fn<string | null | false>;
    protected _hiddenLabel = false;
    protected _visible: Fn<boolean> = true;
    protected _hidden: Fn<boolean> = false;
    protected _disabled: Fn<boolean> = false;
    protected _columnSpan?: ColumnSpan;
    protected _columnStart?: number | Record<string, number>;
    protected _columnOrder?: number | Record<string, number>;
    protected _maxWidth?: string;
    protected _gridContainer = false;
    protected _columns?: number | Record<string, number> | null;
    protected _live: false | { onBlur?: boolean; debounce?: number } = false;
    protected _afterStateUpdated: Array<(ctx: EvalContext) => any> = [];
    protected _extraAttributes: Record<string, any> = {};
    protected _id?: string;
    protected _statePath?: string | null;
    protected _hiddenOn?: string | string[];
    protected _visibleOn?: string | string[];
    protected _disabledOn?: string | string[];
    protected _dehydrated?: Fn<boolean>;
    protected _dehydratedWhenHidden = false;
    protected _afterStateHydrated: Array<(ctx: EvalContext) => any> = [];
    protected _dehydrateStateUsing?: (ctx: EvalContext) => any;
    protected _mutateDehydratedStateUsing?: (ctx: EvalContext) => any;
    parent: Component | null = null;

    constructor(key?: string | null) {
        this._key = key ?? null;
    }

    /* ---- fluent configuration shared by all components ---- */
    label(v: Fn<string | null | false>) { this._label = v; return this; }
    hiddenLabel(v = true) { this._hiddenLabel = v; return this; }
    visible(v: Fn<boolean>) { this._visible = v; return this; }
    hidden(v: Fn<boolean>) { this._hidden = v; return this; }
    visibleOn(v: string | string[]) { this._visibleOn = v; return this; }
    hiddenOn(v: string | string[]) { this._hiddenOn = v; return this; }
    disabled(v: Fn<boolean> = true) { this._disabled = v; return this; }
    disabledOn(v: string | string[]) { this._disabledOn = v; return this; }
    columnSpan(v: ColumnSpan) { this._columnSpan = v; return this; }
    columnSpanFull() { this._columnSpan = 'full'; return this; }
    columnStart(v: number | Record<string, number>) { this._columnStart = v; return this; }
    columnOrder(v: number | Record<string, number>) { this._columnOrder = v; return this; }
    maxWidth(v: string) { this._maxWidth = v; return this; }
    gridContainer(v = true) { this._gridContainer = v; return this; }
    columns(v: number | Record<string, number> | null) { this._columns = v; return this; }
    live(onBlur: boolean | { onBlur?: boolean; debounce?: number } = false, debounce?: number) {
        this._live = typeof onBlur === 'object' ? onBlur : { onBlur: onBlur === true, debounce };
        return this;
    }
    /** `reactive()` is `live()` */
    reactive() { return this.live(); }
    afterStateUpdated(fn: (ctx: EvalContext) => any) { this._afterStateUpdated.push(fn); return this; }
    afterStateHydrated(fn: (ctx: EvalContext) => any) { this._afterStateHydrated.push(fn); return this; }
    extraAttributes(v: Record<string, any>) { this._extraAttributes = v; return this; }
    id(v: string) { this._id = v; return this; }
    statePath(v: string | null) { this._statePath = v; return this; }
    dehydrated(v: Fn<boolean> = true) { this._dehydrated = v; return this; }
    dehydratedWhenHidden(v = true) { this._dehydratedWhenHidden = v; return this; }
    dehydrateStateUsing(fn: (ctx: EvalContext) => any) { this._dehydrateStateUsing = fn; return this; }
    mutateDehydratedStateUsing(fn: (ctx: EvalContext) => any) { this._mutateDehydratedStateUsing = fn; return this; }

    /* ---- identity ---- */
    /** `->key('settings')`: the key of a layout component (its id in the DOM) */
    key(v: string) { this._key = v; return this; }
    getKey(): string | null { return this._key; }
    /** does this component own a state entry? (layout components do not) */
    hasStatePath(): boolean { return false; }
    getName(): string | null { return this._key; }

    /** path of this component's state relative to the form root */
    getStatePath(ctx: RenderContext): string {
        if (!this.hasStatePath()) return ctx.container;
        const name = this._statePath ?? this.getName();
        return [ctx.container, name].filter(Boolean).join('.');
    }

    /* ---- evaluation ---- */
    evalCtx(rc: RenderContext, extra: Record<string, any> = {}): EvalContext {
        const container = rc.container;
        const self = this;
        return {
            get: (path: string, isAbsolute = false) => getPath(rc.state, resolvePath(container, path, isAbsolute)),
            set: (path: string, value: unknown, isAbsolute = false) => setPath(rc.state, resolvePath(container, path, isAbsolute), value),
            state: this.hasStatePath() ? getPath(rc.state, this.getStatePath(rc)) : undefined,
            record: rc.record,
            operation: rc.operation,
            user: rc.user,
            livewire: rc.livewire,
            component: self,
            ...rc.extra,
            ...extra,
        };
    }

    ev<T>(v: Fn<T> | undefined, rc: RenderContext): Promise<T | undefined> {
        return evaluate(v as any, this.evalCtx(rc)) as Promise<T | undefined>;
    }

    async isVisible(rc: RenderContext): Promise<boolean> {
        const ops = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
        if (this._visibleOn && !ops(this._visibleOn).includes(rc.operation)) return false;
        if (this._hiddenOn && ops(this._hiddenOn).includes(rc.operation)) return false;
        if ((await this.ev(this._hidden, rc)) === true) return false;
        if ((await this.ev(this._visible, rc)) === false) return false;
        return true;
    }

    async isDisabled(rc: RenderContext): Promise<boolean> {
        if (rc.extra.disabledSchema) return true;
        if (this._disabledOn && (Array.isArray(this._disabledOn) ? this._disabledOn : [this._disabledOn]).includes(rc.operation)) return true;
        if ((await this.ev(this._disabled, rc)) === true) return true;
        return this.parent ? this.parent.isDisabled(rc) : false;
    }

    async getLabel(rc: RenderContext): Promise<string | null> {
        const label = await this.ev(this._label, rc);
        // `label(false)` falls back to the headline of the field name, like the original does
        if (label !== undefined && label !== false) return label;
        return this.defaultLabel();
    }

    protected defaultLabel(): string | null {
        const name = this.getName();
        if (!name) return null;
        // `Str::headline` of the last segment, as Filament does (`first_name` -> `First name`)
        const last = name.split('.').pop() as string;
        const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    isLabelHidden() { return this._hiddenLabel; }
    getExtraAttributes() { return this._extraAttributes; }
    getColumnSpan() { return this._columnSpan; }
    getColumnStart() { return this._columnStart; }
    getColumnOrder() { return this._columnOrder; }
    getMaxWidth() { return this._maxWidth; }
    isGridContainer() { return this._gridContainer; }
    getColumns() { return this._columns; }
    isLive() { return this._live; }
    hasAfterStateUpdated() { return this._afterStateUpdated.length > 0; }

    /** the component (this one or below it) that owns a state path */
    /** the component (this one or below it) that owns a state path, with the render context it renders in */
    async findByStatePath(rc: RenderContext, path: string): Promise<{ component: Component; rc: RenderContext } | null> {
        if (this.hasStatePath() && this.getStatePath(rc) === path) return { component: this, rc };
        for (const child of await this.getChildren(rc)) {
            const found = await child.findByStatePath(rc, path);
            if (found) return found;
        }
        return null;
    }

    /** a collapsible section / tab may hide its fields: their `required` / `maxlength` attributes are left out (`isConcealed()`) */
    canConcealComponents(): boolean { return false; }
    isConcealed(): boolean {
        for (let p = this.parent; p; p = p.parent) if (p.canConcealComponents()) return true;
        return false;
    }

    /** static child components (layout components) */
    getChildComponents(): Component[] { return []; }

    /** the children for a render: closures of a layout (`schema(fn ($get) => [...])`) are evaluated here */
    async getChildren(_rc: RenderContext): Promise<Component[]> {
        const list = this.getChildComponents();
        for (const c of list) c.parent = this;
        return list;
    }

    /** the components below this one with the render context they are rendered in (a repeater has one per item) */
    async getHydrationEntries(rc: RenderContext): Promise<Array<{ component: Component; rc: RenderContext }>> {
        return (await this.getChildren(rc)).map((component) => ({ component, rc }));
    }

    /** `afterStateHydrated` of this component and everything below it */
    async runAfterStateHydratedDeep(rc: RenderContext): Promise<void> {
        await this.runAfterStateHydrated(rc);
        for (const entry of await this.getHydrationEntries(rc)) await entry.component.runAfterStateHydratedDeep(entry.rc);
    }

    /** `afterStateUpdated` closures */
    async runAfterStateUpdated(rc: RenderContext, old?: unknown): Promise<void> {
        for (const fn of this._afterStateUpdated) await fn(this.evalCtx(rc, { old }));
    }
    async runAfterStateHydrated(rc: RenderContext): Promise<void> {
        for (const fn of this._afterStateHydrated) await fn(this.evalCtx(rc));
    }

    /** default state of this component (and its children) written into `state` */
    async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true): Promise<void> {
        for (const child of await this.getChildren(rc)) await child.hydrateDefaults(rc, state, applyDefaults);
    }

    /** `loadStateFromRelationships()`: to-many relationship fields read their ids from the record */
    async loadRelationshipState(rc: RenderContext, record: any, state: Record<string, any>): Promise<void> {
        for (const child of await this.getChildren(rc)) await child.loadRelationshipState(rc, record, state);
    }

    /** `saveRelationships()`: after the record was saved */
    async saveRelationships(rc: RenderContext, record: any, data: Record<string, any>): Promise<void> {
        for (const child of await this.getChildren(rc)) await child.saveRelationships(rc, record, data);
    }

    /** collect validation rules of this component and its children: `statePath -> rules` */
    async collectRules(rc: RenderContext, rules: Record<string, any[]>, attributes: Record<string, string>): Promise<void> {
        if (!(await this.isVisible(rc))) return;
        for (const child of await this.getChildren(rc)) await child.collectRules(rc, rules, attributes);
    }

    /** `dehydrateState`: write this component's value into the output (only when dehydrated) */
    async dehydrate(rc: RenderContext, out: Record<string, any>): Promise<void> {
        if (this._dehydrated !== undefined && (await this.ev(this._dehydrated, rc)) === false) return;
        if (!(await this.isVisible(rc)) && !this._dehydratedWhenHidden) return;
        if (this.hasStatePath()) {
            const path = this.getStatePath(rc);
            let value = getPath(rc.state, path);
            if (this._dehydrateStateUsing) value = await this._dehydrateStateUsing(this.evalCtx(rc, { state: value }));
            if (value !== undefined || path) setPath(out, path, value);
            if (this._mutateDehydratedStateUsing) setPath(out, path, await this._mutateDehydratedStateUsing(this.evalCtx(rc, { state: getPath(out, path) })));
        }
        for (const child of await this.getChildren(rc)) await child.dehydrate(rc, out);
    }

    abstract render(rc: RenderContext): Promise<ReactNode>;
}

export { getPath, setPath };
