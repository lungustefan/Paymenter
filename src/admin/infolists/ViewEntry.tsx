import type { ReactNode } from 'react';
import { Entry } from './Entry';
import { Component, type RenderContext } from '../forms/Component';
import type { EvalContext } from '../core/evaluate';

export interface ViewContext extends EvalContext {
    record: any;
    state: any;
    entry: Component;
}

/**
 * Filament\Infolists\Components\ViewEntry. The Blade view of the original is a function that returns the
 * React markup (`view(({ record, state }) => <…/>)`).
 */
export class ViewEntry extends Entry {
    protected _view?: (ctx: ViewContext) => ReactNode | Promise<ReactNode>;
    view(v: (ctx: ViewContext) => ReactNode | Promise<ReactNode>) { this._view = v; return this; }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const state = await this.getState(rc);
        return this._view ? this._view({ ...this.evalCtx(rc), state, record: rc.record, entry: this }) : null;
    }
}

/** Filament\Schemas\Components\View: renders a view in the schema */
export class View extends Component {
    protected _view?: (ctx: ViewContext) => ReactNode | Promise<ReactNode>;
    static make(): View {
        return new View();
    }
    view(v: (ctx: ViewContext) => ReactNode | Promise<ReactNode>) { this._view = v; return this; }
    override async render(rc: RenderContext): Promise<ReactNode> {
        return this._view ? this._view({ ...this.evalCtx(rc), state: undefined, record: rc.record, entry: this }) : null;
    }
}
