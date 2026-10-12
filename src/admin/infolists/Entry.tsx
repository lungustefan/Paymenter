import type { ReactNode } from 'react';
import { Component, type RenderContext } from '../forms/Component';
import { evaluate, type EvalContext, type Fn } from '../core/evaluate';
import { Column } from '../tables/columns/Column';
import { cn } from '@themes/default/components/cn';

/** reads `data_get($record, 'a.b')` through relations and accessors */
class AttributeReader extends Column {
    override async render() {
        return null;
    }
}
const reader = new AttributeReader('_');

/** Filament\Infolists\Components\Entry: a read-only value of the record, with a label */
export abstract class Entry extends Component {
    protected _state?: (ctx: EvalContext) => any;
    protected _default?: Fn<any>;
    protected _placeholder?: Fn<string | null>;
    protected _url?: Fn<string | null>;
    protected _openUrlInNewTab = false;
    protected _alignment?: string;
    protected _inlineLabel = false;
    protected _helperText?: Fn<string | null>;
    protected _tooltip?: Fn<string | null>;

    constructor(name: string) {
        super(name);
    }

    static make<T extends Entry>(this: new (name: string) => T, name: string): T {
        return new this(name);
    }

    override hasStatePath() {
        return true;
    }

    /** the entry does not own a path in the form state: it reads the record */
    override getStatePath(rc: RenderContext) {
        return [rc.container, this.getName()].filter(Boolean).join('.');
    }

    state(v: ((ctx: EvalContext) => any) | any) { this._state = typeof v === 'function' ? v : () => v; return this; }
    getStateUsing(v: (ctx: EvalContext) => any) { this._state = v; return this; }
    default(v: Fn<any>) { this._default = v; return this; }
    placeholder(v: Fn<string | null>) { this._placeholder = v; return this; }
    url(v: Fn<string | null>, shouldOpenInNewTab = false) { this._url = v; this._openUrlInNewTab = shouldOpenInNewTab; return this; }
    openUrlInNewTab(v = true) { this._openUrlInNewTab = v; return this; }
    alignment(v: string) { this._alignment = v; return this; }
    alignStart() { return this.alignment('start'); }
    alignCenter() { return this.alignment('center'); }
    alignEnd() { return this.alignment('end'); }
    inlineLabel(v = true) { this._inlineLabel = v; return this; }
    helperText(v: Fn<string | null>) { this._helperText = v; return this; }
    tooltip(v: Fn<string | null>) { this._tooltip = v; return this; }

    /** `getState()`: the closure, else the attribute of the record */
    async getState(rc: RenderContext): Promise<any> {
        let state: any;
        if (this._state) state = await this._state({ ...this.evalCtx(rc), state: undefined });
        else if (rc.record) state = await reader.resolveAttribute(rc.record, this.getName() ?? '');
        else state = getFromState(rc.state, this.getName() ?? '');
        if ((state === null || state === undefined || (Array.isArray(state) && state.length === 0)) && this._default !== undefined) state = await evaluate(this._default as any, { ...this.evalCtx(rc), state });
        return state;
    }

    /** closures of the entry get the resolved `$state` */
    protected evalWith<T>(v: Fn<T> | undefined, rc: RenderContext, state: any, extra: Record<string, any> = {}): Promise<T | undefined> {
        return evaluate(v as any, { ...this.evalCtx(rc), state, ...extra }) as Promise<T | undefined>;
    }

    override async isVisible(rc: RenderContext): Promise<boolean> {
        const ops = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
        if (this._visibleOn && !ops(this._visibleOn).includes(rc.operation)) return false;
        if (this._hiddenOn && ops(this._hiddenOn).includes(rc.operation)) return false;
        const needsState = typeof this._hidden === 'function' || typeof this._visible === 'function';
        const state = needsState ? await this.getState(rc) : undefined;
        if ((await this.evalWith(this._hidden, rc, state)) === true) return false;
        if ((await this.evalWith(this._visible, rc, state)) === false) return false;
        return true;
    }

    override async collectRules() {}
    override async dehydrate() {}
    override async hydrateDefaults() {}

    protected alignClass() {
        const a = this._alignment;
        return a ? (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(a) ? `fi-align-${a}` : a) : '';
    }

    /** `<x-filament-infolists::entry-wrapper>` */
    protected async wrapEntry(rc: RenderContext, slot: ReactNode, state: any): Promise<ReactNode> {
        const label = await this.getLabel(rc);
        const srOnly = this.isLabelHidden();
        const url = await this.evalWith(this._url, rc, state);
        const helper = await this.evalWith(this._helperText, rc, state);
        const content = (
            <div className={cn('fi-in-entry-content', this.alignClass())} {...(url ? {} : {})}>
                {slot}
            </div>
        );
        return (
            <div className={cn('fi-in-entry', this._inlineLabel && 'fi-in-entry-has-inline-label')}>
                {label && srOnly && (
                    <div className="fi-in-entry-label fi-sr-only" role="term">
                        {label}
                    </div>
                )}
                <div className="fi-in-entry-label-col">
                    {label && !srOnly && (
                        <div className="fi-in-entry-label-ctn">
                            <div className="fi-in-entry-label" role="term">
                                {label}
                            </div>
                        </div>
                    )}
                </div>
                <div className="fi-in-entry-content-col">
                    <div className="fi-in-entry-content-ctn" role="definition">
                        {url ? (
                            <a href={url} {...(this._openUrlInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={cn('fi-in-entry-content', this.alignClass())}>
                                {slot}
                            </a>
                        ) : (
                            content
                        )}
                    </div>
                    {helper ? <p className="fi-in-entry-helper-text">{helper}</p> : null}
                </div>
            </div>
        );
    }
}

function getFromState(state: Record<string, any>, path: string) {
    return path.split('.').reduce<any>((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), state);
}
