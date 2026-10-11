import type { ReactNode } from 'react';
import { Layout } from './Layout';
import type { RenderContext } from '../Component';
import { Action, ActionGroup, findByName } from '../../actions/Action';
import { renderActionsGroup } from '../../actions/render';

/**
 * Filament\Schemas\Components\Actions: a row of actions inside a schema. The ids of its actions are
 * `<prefix>.<name>`, which the page that owns the schema resolves (`findAction`).
 */
export class Actions extends Layout {
    protected _actions: Array<Action | ActionGroup> = [];
    /** where the action ids live; the host of the schema sets it */
    actionPrefix = 'schema';

    static make(actions: Array<Action | ActionGroup> = []): Actions {
        const a = new Actions();
        a._actions = actions;
        return a;
    }

    getActions() {
        return this._actions;
    }

    findAction(name: string): Action | undefined {
        return findByName(this._actions, name) ?? undefined;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const ctx = { get: (p: string) => rc.state[p], set: () => undefined, record: rc.record, operation: rc.operation, user: rc.user, livewire: rc.livewire, ...rc.extra } as any;
        return <div className="fi-sc-actions">{await renderActionsGroup(this._actions, ctx, this.actionPrefix, { alignment: '', defaultStyle: 'button' })}</div>;
    }
}
