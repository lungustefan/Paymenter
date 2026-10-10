import type { User } from '@/server/models/User';
import type { Action, ActionContext } from '../actions/Action';
import type { RenderContext } from '../forms/Component';
import type { Schema } from '../forms/Schema';
import type { AdminActionResult } from '../protocol';
import type { Table } from '../tables/Table';
import { parseTableState } from '../tables/state';

/** an action resolved by its id, with the context it runs in */
export interface ActionRef {
    action: Action;
    ctx: ActionContext;
    /** the render context of the form the action belongs to (field actions): `$set()` calls change its state */
    rc?: RenderContext;
}

/** a form resolved by its id */
export interface FormRef {
    schema: Schema;
    rc: RenderContext;
}

/**
 * The "livewire component" of a page: it renders the page and answers the calls the browser makes
 * (form refresh / submit, mounting actions, ...). The dispatcher re-creates it for every call.
 */
export abstract class Host {
    user!: User;
    params: Record<string, string> = {};
    searchParams: Record<string, string | string[] | undefined> = {};
    pathname = '';

    /** `mount()` - load state; throw (notFound / redirect) to abort */
    mount(): Promise<void> | void {}

    /** the tables of the page by id (`table`, `rm0`, ...) */
    getTables(): Record<string, Table> {
        return {};
    }

    /** the action with this id (`header.delete`, `table.<id>.record.5.edit`, `field:name:hint:refresh`, ...) */
    async findAction(id: string, state?: Record<string, any>): Promise<ActionRef | null> {
        if (id.startsWith('field:')) return this.findFieldAction(id, state);
        if (id.startsWith('table.')) {
            const [, tableId, ...rest] = id.split('.');
            const table = this.getTables()[tableId];
            return table ? table.findAction(rest.join('.')) : null;
        }
        return null;
    }

    /** `field:<statePath>:<hint|prefix|suffix>:<name>`: an action rendered inside a field of the page's form */
    protected async findFieldAction(id: string, state?: Record<string, any>): Promise<ActionRef | null> {
        const m = /^field:(.+):(hint|prefix|suffix):([^:]+)$/.exec(id);
        if (!m) return null;
        const form = await this.getForm('form', state);
        if (!form) return null;
        const found = await form.schema.findByStatePath(form.rc, m[1]);
        const component: any = found?.component;
        const action = component?.inlineActions?.(m[2])?.find((a: Action) => a.getName() === m[3]);
        if (!found || !action) return null;
        const ctx = { ...component.evalCtx(found.rc), action, record: found.rc.record, user: this.user, livewire: this, model: found.rc.model } as ActionContext;
        return { action, ctx, rc: found.rc };
    }

    /** the form with this id (`form`) built around the given state */
    getForm(_id: string, _state?: Record<string, any>): Promise<FormRef | null> {
        return Promise.resolve(null);
    }

    /** a submit of the page's own form (`create`, `save`, ...) */
    submitForm(_id: string, _state: Record<string, any>, _args?: Record<string, any>): Promise<AdminActionResult> {
        return Promise.resolve({ ok: false });
    }

    /** `wire:click="method"` style calls of custom pages */
    callMethod(_method: string, _args: any[], _state?: Record<string, any>): Promise<AdminActionResult> {
        return Promise.resolve({ ok: false });
    }

    /** table interactions: toggle / inline input / reorder / all keys */
    async tableUpdate(tableId: string, action: string, args: Record<string, any>): Promise<AdminActionResult> {
        const table = this.getTables()[tableId];
        if (!table) return { ok: false };
        const result = await table.update(action, args, parseTableState(this.searchParams, table.prefix));
        return { ok: result.ok, data: result.data };
    }
}
