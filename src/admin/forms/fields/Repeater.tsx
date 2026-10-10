import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { Field } from '../Field';
import { Component, getPath, setPath, type RenderContext } from '../Component';
import { renderItems, type SchemaItem } from '../Schema';
import { RepeaterControl, type RepeaterItemProps } from '../controls-repeater';
import { trans } from '../../context';
import { Action } from '../../actions/Action';
import type { Fn } from '../../core/evaluate';
import type { Builder } from '@/server/orm';
import type { Rule } from '@/server/validation';

export interface RepeaterMutation {
    op: 'add' | 'clone' | 'delete' | 'move' | 'moveUp' | 'moveDown';
    key?: string;
    order?: string[];
    afterItem?: string;
}

/** Filament\Forms\Components\Repeater (state: `{ <uuid | record-id>: { ...fields } }`) */
export class Repeater extends Field {
    protected _schema: Fn<SchemaItem[]> = [];
    protected _relationship?: { name: string; modifyQuery?: (q: Builder<any>) => void };
    protected _orderColumn: string | null = null;
    protected _reorderable: Fn<boolean> = true;
    protected _cloneable: Fn<boolean> = false;
    protected _collapsible: Fn<boolean> = false;
    protected _collapsed: Fn<boolean> = false;
    protected _addable: Fn<boolean> = true;
    protected _deletable: Fn<boolean> = true;
    protected _addLabel?: Fn<string | null>;
    protected _minItems?: Fn<number | null>;
    protected _maxItems?: Fn<number | null>;
    protected _defaultItems: Fn<number> = 1;
    protected _itemLabel?: (ctx: any) => string | null | Promise<string | null>;
    protected _itemNumbers = false;
    protected _deleteAction?: ((action: Action) => any) | null;
    protected _gridColumns?: number | Record<string, number> | null;
    protected _reorderWithButtons = false;
    protected _hasItemHeaders = true;

    schema(v: Fn<SchemaItem[]>) { this._schema = v; return this; }
    relationship(name?: string | null, modifyQuery?: (q: Builder<any>) => void) {
        this._relationship = { name: name ?? this.getName() ?? '', modifyQuery };
        return this;
    }
    orderColumn(v: string | null = 'sort') { this._orderColumn = v; return this; }
    reorderable(v: Fn<boolean> = true) { this._reorderable = v; return this; }
    reorderableWithButtons(v = true) { this._reorderWithButtons = v; return this; }
    cloneable(v: Fn<boolean> = true) { this._cloneable = v; return this; }
    collapsible(v: Fn<boolean> = true) { this._collapsible = v; return this; }
    collapsed(v: Fn<boolean> = true) { this._collapsed = v; this._collapsible = true; return this; }
    addable(v: Fn<boolean> = true) { this._addable = v; return this; }
    deletable(v: Fn<boolean> = true) { this._deletable = v; return this; }
    addActionLabel(v: Fn<string | null>) { this._addLabel = v; return this; }
    minItems(v: Fn<number | null>) { this._minItems = v; return this; }
    maxItems(v: Fn<number | null>) { this._maxItems = v; return this; }
    defaultItems(v: Fn<number>) { this._defaultItems = v; return this; }
    itemLabel(fn: (ctx: any) => string | null | Promise<string | null>) { this._itemLabel = fn; return this; }
    itemNumbers(v = true) { this._itemNumbers = v; return this; }
    deleteAction(fn: ((action: Action) => any) | null) { this._deleteAction = fn; return this; }
    grid(v: number | Record<string, number> | null) { this._gridColumns = v; return this; }
    /** `->name('name')` of the original is the field of the item used as its label in the DOM; unused */
    name(_v: string) { return this; }
    simple() { return this; }
    hiddenItemHeaders(v = true) { this._hasItemHeaders = !v; return this; }

    override hasStatePath() {
        return true;
    }
    protected override emptyState(): any {
        return {};
    }

    /* ---- items ---- */

    protected async schemaItems(rc: RenderContext): Promise<SchemaItem[]> {
        const items = ((await this.ev(this._schema, rc)) ?? []) as SchemaItem[];
        for (const i of items) if (i instanceof Component) i.parent = this;
        return items;
    }

    override getChildComponents(): Component[] {
        return Array.isArray(this._schema) ? (this._schema.filter((c) => c instanceof Component) as Component[]) : [];
    }
    override async getChildren(rc: RenderContext): Promise<Component[]> {
        return (await this.schemaItems(rc)).filter((c): c is Component => c instanceof Component);
    }

    /** the render context of one item: its fields live under `<path>.<key>` */
    itemRc(rc: RenderContext, key: string, record?: any): RenderContext {
        return { ...rc, container: `${this.getStatePath(rc)}.${key}`, record: record === undefined ? rc.record : record };
    }

    protected items(rc: RenderContext): Record<string, any> {
        const v = getPath(rc.state, this.getStatePath(rc));
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }

    private async isCollapsible(rc: RenderContext) {
        return (await this.ev(this._collapsible, rc)) === true;
    }

    /** `[{...}, {...}]` (a JSON column) or `{ key: {...} }` -> keyed items */
    private toKeyed(value: unknown): Record<string, any> {
        if (Array.isArray(value)) return Object.fromEntries(value.map((item) => [randomUUID(), item]));
        return value && typeof value === 'object' ? (value as Record<string, any>) : {};
    }

    override async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true) {
        const path = this.getStatePath(rc);
        let value = getPath(state, path);
        if (value === undefined) {
            value = {};
            if (applyDefaults && !this._relationship) {
                const n = (await this.ev(this._defaultItems, rc)) ?? 0;
                for (let i = 0; i < n; i++) value[randomUUID()] = {};
            } else if (applyDefaults && this._relationship) {
                const n = (await this.ev(this._defaultItems, rc)) ?? 0;
                for (let i = 0; i < n; i++) value[randomUUID()] = {};
            }
            setPath(state, path, value);
        } else {
            value = this.toKeyed(value);
            setPath(state, path, value);
        }
        const probe = { ...rc, state };
        for (const key of Object.keys(value)) {
            const irc = this.itemRc(probe, key);
            for (const child of await this.getChildren(irc)) await child.hydrateDefaults(irc, state, applyDefaults);
        }
    }

    override async loadRelationshipState(rc: RenderContext, record: any, state: Record<string, any>) {
        if (!this._relationship || !record) return;
        const path = this.getStatePath(rc);
        const q: Builder<any> = record.relation(this._relationship.name);
        if (this._relationship.modifyQuery) this._relationship.modifyQuery(q);
        if (this._orderColumn) q.orderBy(this._orderColumn);
        const rows = await q.get();
        const items: Record<string, any> = {};
        for (const row of rows) items[`record-${row.getKey()}`] = { ...(await rowData(row)) };
        setPath(state, path, items);
        const probe = { ...rc, state };
        for (const row of rows) {
            const key = `record-${row.getKey()}`;
            const irc = this.itemRc(probe, key, row);
            for (const child of await this.getChildren(irc)) await child.loadRelationshipState(irc, row, state);
        }
    }

    /* ---- mutations (add / clone / delete / move) ---- */

    async mutate(rc: RenderContext, m: RepeaterMutation): Promise<void> {
        const path = this.getStatePath(rc);
        const items = this.items(rc);
        const keys = Object.keys(items);
        const place = (next: Record<string, any>) => setPath(rc.state, path, next);

        if (m.op === 'add') {
            const maxItems = await this.ev(this._maxItems, rc);
            if (maxItems !== null && maxItems !== undefined && keys.length >= maxItems) return;
            const key = randomUUID();
            const next: Record<string, any> = {};
            let inserted = false;
            for (const k of keys) {
                next[k] = items[k];
                if (m.afterItem === k) {
                    next[key] = {};
                    inserted = true;
                }
            }
            if (!inserted) next[key] = {};
            place(next);
            const irc = this.itemRc(rc, key);
            for (const child of await this.getChildren(irc)) await child.hydrateDefaults(irc, rc.state, true);
        } else if (m.op === 'clone' && m.key && items[m.key]) {
            const key = randomUUID();
            const copy = structuredClone(items[m.key]);
            // a copy of a related record is a new record
            this.stripIds(copy);
            const next: Record<string, any> = {};
            for (const k of keys) {
                next[k] = items[k];
                if (k === m.key) next[key] = copy;
            }
            place(next);
        } else if (m.op === 'delete' && m.key) {
            if (this._deleteAction === null) return;
            if (this._deleteAction) {
                const action = Action.make('delete');
                this._deleteAction(action);
                // `$action->cancel()` inside `before()` is reported through the outcome
                const outcome = await action.execute({ ...(this.evalCtx(rc) as any), action, state: items, arguments: { item: m.key }, record: rc.record, get: (p: string) => getPath(rc.state, p), set: () => undefined } as any);
                if (outcome.cancelled || outcome.halted) return;
            }
            const next = { ...items };
            delete next[m.key];
            place(next);
        } else if (m.op === 'move' && m.order) {
            const next: Record<string, any> = {};
            for (const k of m.order) if (k in items) next[k] = items[k];
            for (const k of keys) if (!(k in next)) next[k] = items[k];
            place(next);
        } else if ((m.op === 'moveUp' || m.op === 'moveDown') && m.key) {
            const i = keys.indexOf(m.key);
            const j = m.op === 'moveUp' ? i - 1 : i + 1;
            if (i < 0 || j < 0 || j >= keys.length) return;
            const order = [...keys];
            [order[i], order[j]] = [order[j], order[i]];
            const next: Record<string, any> = {};
            for (const k of order) next[k] = items[k];
            place(next);
        }
    }

    private stripIds(item: any) {
        if (item && typeof item === 'object') {
            delete item.id;
            for (const v of Object.values(item)) if (v && typeof v === 'object') this.stripIds(v);
        }
    }

    /* ---- validation / dehydration / saving ---- */

    override async findByStatePath(rc: RenderContext, path: string): Promise<{ component: Component; rc: RenderContext } | null> {
        const own = await super.findByStatePath(rc, path);
        if (own) return own;
        for (const key of Object.keys(this.items(rc))) {
            const irc = this.itemRc(rc, key);
            for (const child of await this.getChildren(irc)) {
                const found = await child.findByStatePath(irc, path);
                if (found) return found;
            }
        }
        return null;
    }

    override async collectRules(rc: RenderContext, rules: Record<string, any[]>, attributes: Record<string, string>) {
        if (!(await this.isVisible(rc))) return;
        const path = this.getStatePath(rc);
        const label = (await this.getLabel(rc)) ?? path;
        const list: any[] = [];
        const min = await this.ev(this._minItems, rc);
        const max = await this.ev(this._maxItems, rc);
        const count = Object.keys(this.items(rc)).length;
        const attribute = (this._validationAttribute ?? label).toLowerCase();
        if (min !== null && min !== undefined) list.push((_v: any, fail: (m: string) => void) => count < min && fail(trans('validation.min.array', { attribute, min })));
        if (max !== null && max !== undefined) list.push((_v: any, fail: (m: string) => void) => count > max && fail(trans('validation.max.array', { attribute, max })));
        if (list.length) rules[path] = [...(rules[path] ?? []), ...list];
        attributes[path] = this._validationAttribute ?? label.charAt(0).toLowerCase() + label.slice(1);
        for (const key of Object.keys(this.items(rc))) {
            const irc = this.itemRc(rc, key);
            for (const child of await this.getChildren(irc)) await child.collectRules(irc, rules, attributes);
        }
    }

    /** the data of one item as the schema dehydrates it */
    private async dehydrateItem(rc: RenderContext, key: string): Promise<Record<string, any>> {
        const irc = this.itemRc(rc, key);
        const out: Record<string, any> = {};
        for (const child of await this.getChildren(irc)) await child.dehydrate(irc, out);
        return getPath(out, irc.container) ?? {};
    }

    override async dehydrate(rc: RenderContext, out: Record<string, any>): Promise<void> {
        if (!(await this.isVisible(rc))) return;
        // a relationship repeater is saved with the record (`saveRelationships()`), not as a column
        if (this._relationship) return;
        const list: Record<string, any>[] = [];
        let i = 0;
        for (const key of Object.keys(this.items(rc))) {
            const item = await this.dehydrateItem(rc, key);
            if (this._orderColumn) item[this._orderColumn] = ++i;
            list.push(item);
        }
        setPath(out, this.getStatePath(rc), list);
    }

    override async saveRelationships(rc: RenderContext, record: any, _data: Record<string, any>) {
        if (!this._relationship) {
            for (const key of Object.keys(this.items(rc))) {
                const irc = this.itemRc(rc, key);
                for (const child of await this.getChildren(irc)) await child.saveRelationships(irc, record, {});
            }
            return;
        }
        if (!(await this.isVisible(rc))) return;
        const relation = this._relationship.name;
        const existing = new Map<string, any>();
        for (const row of await record.relation(relation).get()) existing.set(String(row.getKey()), row);
        const kept = new Set<string>();
        let order = 0;
        for (const key of Object.keys(this.items(rc))) {
            const data = await this.dehydrateItem(rc, key);
            if (this._orderColumn) data[this._orderColumn] = ++order;
            let row: any;
            const id = key.startsWith('record-') ? key.slice('record-'.length) : null;
            if (id !== null && existing.has(id)) {
                row = existing.get(id);
                kept.add(id);
                await row.update(data);
            } else {
                row = await record.relation(relation).create(data);
            }
            const irc = this.itemRc(rc, key, row);
            for (const child of await this.getChildren(irc)) await child.saveRelationships(irc, row, data);
        }
        for (const [id, row] of existing) if (!kept.has(id)) await row.delete();
    }

    /* ---- rendering ---- */

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const keys = Object.keys(this.items(rc));
        const collapsible = await this.isCollapsible(rc);
        const collapsed = (await this.ev(this._collapsed, rc)) === true;
        const cloneable = (await this.ev(this._cloneable, rc)) === true;
        const deletable = (await this.ev(this._deletable, rc)) !== false && this._deleteAction !== null;
        const reorderable = (await this.ev(this._reorderable, rc)) !== false;
        const addable = (await this.ev(this._addable, rc)) !== false;
        const maxItems = await this.ev(this._maxItems, rc);
        const canAdd = addable && !(maxItems !== null && maxItems !== undefined && keys.length >= maxItems) && !(await this.isDisabled(rc));
        const addLabel = (await this.ev(this._addLabel, rc)) ?? trans('filament-forms::components.repeater.actions.add.label', { label: ((await this.getLabel(rc)) ?? '').toLowerCase() });

        const items: RepeaterItemProps[] = [];
        let index = 0;
        for (const key of keys) {
            index++;
            const irc = this.itemRc(rc, key);
            const children = await this.schemaItems(irc);
            const content = await renderItems(irc, children, { columns: (this.getColumns() as any) ?? undefined });
            const label = this._itemLabel ? await this._itemLabel({ ...this.evalCtx(irc), state: getPath(rc.state, irc.container) ?? {}, key, index: index - 1 }) : null;
            items.push({ key, label: label ?? null, number: this._itemNumbers ? index : null, content });
        }

        const control = (
            <RepeaterControl
                path={path}
                id={id}
                labelId={`${id}-label`}
                items={items}
                collapsible={collapsible}
                collapsed={collapsed}
                cloneable={cloneable}
                deletable={deletable}
                reorderable={reorderable && !this._reorderWithButtons}
                reorderWithButtons={reorderable && this._reorderWithButtons}
                canAdd={canAdd}
                addLabel={addLabel}
                grid={(this._gridColumns as any) ?? null}
                headers={this._hasItemHeaders}
                labels={{
                    move: trans('filament-forms::components.repeater.actions.reorder.label'),
                    clone: trans('filament-forms::components.repeater.actions.clone.label'),
                    delete: trans('filament-forms::components.repeater.actions.delete.label'),
                    collapse: trans('filament-forms::components.repeater.actions.collapse.label'),
                    expand: trans('filament-forms::components.repeater.actions.expand.label'),
                    collapseAll: trans('filament-forms::components.repeater.actions.collapse_all.label'),
                    expandAll: trans('filament-forms::components.repeater.actions.expand_all.label'),
                    moveUp: trans('filament-forms::components.repeater.actions.move_up.label'),
                    moveDown: trans('filament-forms::components.repeater.actions.move_down.label'),
                }}
            />
        );
        return this.wrap(rc, control, { labelTag: 'div' });
    }
}

async function rowData(row: any): Promise<Record<string, any>> {
    const { attributesForForm } = await import('../../core/attributes');
    return attributesForForm(row);
}

export type { Rule };
