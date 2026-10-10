import { getTableName, sql, type SQL } from 'drizzle-orm';
import { Builder, type ModelCtor } from './builder';
import { currentDb } from './context';
import type { Model } from './model';
import { resolveMorph } from './registry';

type Scope = (q: Builder<any>) => void;

export interface RelationDef {
    kind: string;
    related(): ModelCtor<any>;
    scopeFn?: Scope;
    /** add constraints, e.g. `.scope(q => q.orderBy('sort'))` */
    scope(fn: Scope): this;
    /** Eager-load this relation onto `parents` (sets `$relations[name]`). */
    load(parents: Model<any>[], name: string, constraint?: Scope): Promise<void>;
    /** Builder constrained to a single parent (the `$model->relation()` call). */
    query(parent: Model<any>): RelationBuilder<any>;
    /** Correlated subquery used by has()/whereHas(). */
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void): { select: SQL };
    /** `(select related.column from related where <link> limit 1)` - for ordering by a related column */
    columnSubquery?(parentCtor: ModelCtor<any>, column: string): SQL;
    /** True when the relation yields a single model (or null). */
    single: boolean;
}

/** A builder bound to a parent model; `create*` injects the foreign keys. */
export class RelationBuilder<M extends Model<any>> extends Builder<M> {
    constructor(
        model: ModelCtor<M>,
        public readonly def: RelationDef,
        public readonly parent: Model<any>,
        private readonly inject: (child: M) => void = () => {},
    ) {
        super(model);
    }

    protected override async beforeCreate(model: M): Promise<void> {
        this.inject(model);
    }

    override newNested(): Builder<M> {
        return new Builder<M>(this.model);
    }
}

abstract class BaseRelation implements RelationDef {
    abstract kind: string;
    single = false;
    scopeFn?: Scope;
    constructor(protected relatedFn: () => ModelCtor<any>) {}
    related(): ModelCtor<any> {
        return this.relatedFn();
    }
    scope(fn: Scope): this {
        const prev = this.scopeFn;
        this.scopeFn = prev ? (q) => (prev(q), fn(q)) : fn;
        return this;
    }
    protected newRelated(constraint?: Scope): Builder<any> {
        const q = new Builder<any>(this.related());
        this.scopeFn?.(q);
        constraint?.(q);
        return q;
    }
    abstract load(parents: Model<any>[], name: string, constraint?: Scope): Promise<void>;
    abstract query(parent: Model<any>): RelationBuilder<any>;
    abstract exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void): { select: SQL };

    protected correlated(parentCtor: ModelCtor<any>, relatedBuilder: Builder<any>, link: SQL): { select: SQL } {
        const rel = this.related();
        const wheres = scopedWheres(relatedBuilder);
        const where = wheres ? sql`${link} and (${wheres})` : link;
        return { select: sql`select 1 from ${rel.table} where ${where}` };
    }
}

/** Compile a builder's wheres including its model's global scopes. */
export function scopedWheres(b: Builder<any>): SQL | undefined {
    const c: any = b.clone();
    c.applyScopes();
    return c.compileWheres();
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values.filter((v) => v !== null && v !== undefined))];
}

class BelongsTo extends BaseRelation {
    kind = 'belongsTo';
    single = true;
    constructor(related: () => ModelCtor<any>, private foreignKey: string, private ownerKey?: string) {
        super(related);
    }
    private owner() {
        return this.ownerKey ?? this.related().primaryKey;
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const keys = unique(parents.map((p) => (p as any)[this.foreignKey]));
        const rows = keys.length ? await this.newRelated(constraint).whereIn(this.owner(), keys).get() : [];
        const map = new Map(rows.map((r: any) => [String(r[this.owner()]), r]));
        for (const p of parents) p.$relations[name] = map.get(String((p as any)[this.foreignKey])) ?? null;
    }
    query(parent: Model<any>) {
        const q = new RelationBuilder<any>(this.related(), this, parent);
        this.scopeFn?.(q);
        const v = (parent as any)[this.foreignKey];
        return v === null || v === undefined ? q.whereRaw(sql`1 = 0`) : q.where(this.owner(), v);
    }
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void) {
        const b = this.newRelated(callback);
        const rel = this.related();
        const link = sql`${rel.table}.${sql.identifier(this.owner())} = ${parentCtor.table}.${sql.identifier(this.foreignKey)}`;
        return this.correlated(parentCtor, b, link);
    }
    columnSubquery(parentCtor: ModelCtor<any>, column: string) {
        const rel = this.related();
        return sql`(select ${rel.table}.${sql.identifier(column)} from ${rel.table} where ${rel.table}.${sql.identifier(this.owner())} = ${parentCtor.table}.${sql.identifier(this.foreignKey)} limit 1)`;
    }
}

class HasOneOrMany extends BaseRelation {
    kind: string;
    constructor(related: () => ModelCtor<any>, protected foreignKey: string, protected localKey: string | undefined, many: boolean) {
        super(related);
        this.kind = many ? 'hasMany' : 'hasOne';
        this.single = !many;
    }
    protected local(ctor: ModelCtor<any>) {
        return this.localKey ?? ctor.primaryKey;
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const lk = this.local(parents[0].ctor);
        const keys = unique(parents.map((p) => (p as any)[lk]));
        const rows = keys.length ? await this.newRelated(constraint).whereIn(this.foreignKey, keys).get() : [];
        const groups = new Map<string, any[]>();
        for (const r of rows) {
            const k = String((r as any)[this.foreignKey]);
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
        }
        for (const p of parents) {
            const list = groups.get(String((p as any)[lk])) ?? [];
            p.$relations[name] = this.single ? (list[0] ?? null) : list;
        }
    }
    query(parent: Model<any>) {
        const lk = this.local(parent.ctor);
        const q = new RelationBuilder<any>(this.related(), this, parent, (child) => {
            (child as any)[this.foreignKey] = (parent as any)[lk];
        });
        this.scopeFn?.(q);
        return q.where(this.foreignKey, (parent as any)[lk]);
    }
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void) {
        const b = this.newRelated(callback);
        const rel = this.related();
        const link = sql`${rel.table}.${sql.identifier(this.foreignKey)} = ${parentCtor.table}.${sql.identifier(this.local(parentCtor))}`;
        return this.correlated(parentCtor, b, link);
    }
    columnSubquery(parentCtor: ModelCtor<any>, column: string) {
        const rel = this.related();
        return sql`(select ${rel.table}.${sql.identifier(column)} from ${rel.table} where ${rel.table}.${sql.identifier(this.foreignKey)} = ${parentCtor.table}.${sql.identifier(this.local(parentCtor))} limit 1)`;
    }
}

class Morph extends BaseRelation {
    kind: string;
    constructor(related: () => ModelCtor<any>, private name: string, many: boolean, private localKey?: string) {
        super(related);
        this.kind = many ? 'morphMany' : 'morphOne';
        this.single = !many;
    }
    private type() {
        return `${this.name}_type`;
    }
    private id() {
        return `${this.name}_id`;
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const ctor = parents[0].ctor;
        const lk = this.localKey ?? ctor.primaryKey;
        const keys = unique(parents.map((p) => (p as any)[lk]));
        const rows = keys.length ? await this.newRelated(constraint).where(this.type(), ctor.morphName).whereIn(this.id(), keys).get() : [];
        const groups = new Map<string, any[]>();
        for (const r of rows) {
            const k = String((r as any)[this.id()]);
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
        }
        for (const p of parents) {
            const list = groups.get(String((p as any)[lk])) ?? [];
            p.$relations[name] = this.single ? (list[0] ?? null) : list;
        }
    }
    query(parent: Model<any>) {
        const ctor = parent.ctor;
        const lk = this.localKey ?? ctor.primaryKey;
        const q = new RelationBuilder<any>(this.related(), this, parent, (child) => {
            (child as any)[this.type()] = ctor.morphName;
            (child as any)[this.id()] = (parent as any)[lk];
        });
        this.scopeFn?.(q);
        return q.where(this.type(), ctor.morphName).where(this.id(), (parent as any)[lk]);
    }
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void) {
        const b = this.newRelated(callback);
        const rel = this.related();
        const link = sql`${rel.table}.${sql.identifier(this.id())} = ${parentCtor.table}.${sql.identifier(this.localKey ?? parentCtor.primaryKey)} and ${rel.table}.${sql.identifier(this.type())} = ${parentCtor.morphName}`;
        return this.correlated(parentCtor, b, link);
    }
}

class MorphTo extends BaseRelation {
    kind = 'morphTo';
    single = true;
    constructor(private name: string) {
        super(() => {
            throw new Error('morphTo has no fixed related model');
        });
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const byType = new Map<string, Model<any>[]>();
        for (const p of parents) {
            const t = (p as any)[`${this.name}_type`];
            if (!t) {
                p.$relations[name] = null;
                continue;
            }
            (byType.get(t) ?? byType.set(t, []).get(t)!).push(p);
        }
        for (const [type, group] of byType) {
            const ctor = resolveMorph(type);
            if (!ctor) {
                for (const p of group) p.$relations[name] = null;
                continue;
            }
            const ids = unique(group.map((p) => (p as any)[`${this.name}_id`]));
            const q = new Builder<any>(ctor);
            constraint?.(q);
            const rows = ids.length ? await q.whereIn(ctor.primaryKey, ids).get() : [];
            const map = new Map(rows.map((r: any) => [String(r[ctor.primaryKey]), r]));
            for (const p of group) p.$relations[name] = map.get(String((p as any)[`${this.name}_id`])) ?? null;
        }
    }
    query(parent: Model<any>): RelationBuilder<any> {
        const ctor = resolveMorph((parent as any)[`${this.name}_type`]);
        if (!ctor) throw new Error('Unknown morph type');
        const q = new RelationBuilder<any>(ctor, this, parent);
        return q.where(ctor.primaryKey, (parent as any)[`${this.name}_id`]);
    }
    exists(): { select: SQL } {
        throw new Error('whereHas() on morphTo requires whereHasMorph()');
    }
}

class BelongsToMany extends BaseRelation {
    kind = 'belongsToMany';
    constructor(
        related: () => ModelCtor<any>,
        private pivotTable: string,
        private foreignPivotKey: string,
        private relatedPivotKey: string,
        private parentKey?: string,
        private relatedKey?: string,
        public pivotColumns: string[] = [],
    ) {
        super(related);
    }
    private pk(ctor: ModelCtor<any>) {
        return this.parentKey ?? ctor.primaryKey;
    }
    private rk() {
        return this.relatedKey ?? this.related().primaryKey;
    }
    private async pivotRows(whereSql: SQL): Promise<Record<string, any>[]> {
        const [rows] = (await currentDb().execute(sql`select * from ${sql.identifier(this.pivotTable)} where ${whereSql}`)) as any;
        return rows;
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const pk = this.pk(parents[0].ctor);
        const keys = unique(parents.map((p) => (p as any)[pk]));
        if (!keys.length) {
            for (const p of parents) p.$relations[name] = [];
            return;
        }
        const pivots = await this.pivotRows(sql`${sql.identifier(this.foreignPivotKey)} in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
        const relIds = unique(pivots.map((r) => r[this.relatedPivotKey]));
        const rows = relIds.length ? await this.newRelated(constraint).whereIn(this.rk(), relIds).get() : [];
        const map = new Map(rows.map((r: any) => [String(r[this.rk()]), r]));
        for (const p of parents) {
            p.$relations[name] = pivots
                .filter((pv) => String(pv[this.foreignPivotKey]) === String((p as any)[pk]))
                .map((pv) => map.get(String(pv[this.relatedPivotKey])))
                .filter(Boolean);
        }
    }
    query(parent: Model<any>) {
        const pivot = sql.identifier(this.pivotTable);
        const related = this.related();
        const parentKey = (parent as any)[this.pk(parent.ctor)];
        // `inner join pivot ... where pivot.fk = ?` hands the rows back in the order of the pivot rows
        const pivotOrder = sql`(select min(${sql.identifier('id')}) from ${pivot} where ${sql.identifier(this.foreignPivotKey)} = ${parentKey} and ${sql.identifier(this.relatedPivotKey)} = ${related.table}.${sql.identifier(this.rk())})`;
        class PivotBuilder extends RelationBuilder<any> {
            protected override defaultOrders(): SQL[] {
                return [pivotOrder];
            }
        }
        const q = new PivotBuilder(related, this, parent);
        this.scopeFn?.(q);
        return q.whereRaw(
            sql`${this.related().table}.${sql.identifier(this.rk())} in (select ${sql.identifier(this.relatedPivotKey)} from ${pivot} where ${sql.identifier(this.foreignPivotKey)} = ${(parent as any)[this.pk(parent.ctor)]})`,
        );
    }
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void) {
        const b = this.newRelated(callback);
        const rel = this.related();
        const pivot = sql.identifier(this.pivotTable);
        const link = sql`${rel.table}.${sql.identifier(this.rk())} in (select ${sql.identifier(this.relatedPivotKey)} from ${pivot} where ${sql.identifier(this.foreignPivotKey)} = ${parentCtor.table}.${sql.identifier(this.pk(parentCtor))})`;
        return this.correlated(parentCtor, b, link);
    }

    /* pivot mutators - used as `await def.attach(parent, ids)` */
    async attach(parent: Model<any>, ids: unknown | unknown[], extra: Record<string, unknown> = {}) {
        const list = Array.isArray(ids) ? ids : [ids];
        for (const id of list) {
            const cols = [this.foreignPivotKey, this.relatedPivotKey, ...Object.keys(extra)];
            const vals = [(parent as any)[this.pk(parent.ctor)], id, ...Object.values(extra)];
            await currentDb().execute(
                sql`insert into ${sql.identifier(this.pivotTable)} (${sql.join(cols.map((c) => sql.identifier(c)), sql`, `)}) values (${sql.join(vals.map((v) => sql`${v}`), sql`, `)})`,
            );
        }
    }
    async detach(parent: Model<any>, ids?: unknown[]) {
        const base = sql`${sql.identifier(this.foreignPivotKey)} = ${(parent as any)[this.pk(parent.ctor)]}`;
        const where = ids && ids.length ? sql`${base} and ${sql.identifier(this.relatedPivotKey)} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : base;
        await currentDb().execute(sql`delete from ${sql.identifier(this.pivotTable)} where ${where}`);
    }
    async sync(parent: Model<any>, ids: unknown[]) {
        const rows = await this.pivotRows(sql`${sql.identifier(this.foreignPivotKey)} = ${(parent as any)[this.pk(parent.ctor)]}`);
        const current = rows.map((r) => r[this.relatedPivotKey]);
        const want = ids.map(String);
        const toDetach = current.filter((c) => !want.includes(String(c)));
        const toAttach = ids.filter((i) => !current.map(String).includes(String(i)));
        if (toDetach.length) await this.detach(parent, toDetach);
        if (toAttach.length) await this.attach(parent, toAttach);
        delete parent.$relations[Object.keys(parent.$relations).find((k) => (parent.ctor.relations[k] as any) === this) ?? ''];
    }
}

class HasManyThrough extends BaseRelation {
    kind = 'hasManyThrough';
    constructor(
        related: () => ModelCtor<any>,
        private through: () => ModelCtor<any>,
        private firstKey: string,
        private secondKey: string,
        private localKey: string,
        private secondLocalKey: string,
        private throughScope?: Scope,
    ) {
        super(related);
    }
    async load(parents: Model<any>[], name: string, constraint?: Scope) {
        const keys = unique(parents.map((p) => (p as any)[this.localKey]));
        const tq = new Builder<any>(this.through());
        this.throughScope?.(tq);
        const throughRows = keys.length ? await tq.whereIn(this.firstKey, keys).get() : [];
        const secondKeys = unique(throughRows.map((t: any) => t[this.secondLocalKey]));
        const rows = secondKeys.length ? await this.newRelated(constraint).whereIn(this.secondKey, secondKeys).get() : [];
        for (const p of parents) {
            const mine = throughRows.filter((t: any) => String(t[this.firstKey]) === String((p as any)[this.localKey]));
            const ids = new Set(mine.map((t: any) => String(t[this.secondLocalKey])));
            // preserve the order of the (scoped) related query
            p.$relations[name] = rows.filter((r: any) => ids.has(String(r[this.secondKey])));
        }
    }
    query(parent: Model<any>) {
        const q = new RelationBuilder<any>(this.related(), this, parent);
        this.scopeFn?.(q);
        const throughTable = this.through().table;
        return q.whereRaw(
            sql`${this.related().table}.${sql.identifier(this.secondKey)} in (select ${sql.identifier(this.secondLocalKey)} from ${throughTable} where ${sql.identifier(this.firstKey)} = ${(parent as any)[this.localKey]})`,
        );
    }
    exists(parentCtor: ModelCtor<any>, callback?: (q: Builder<any>) => void) {
        const b = this.newRelated(callback);
        const rel = this.related();
        const throughTable = this.through().table;
        const link = sql`${rel.table}.${sql.identifier(this.secondKey)} in (select ${sql.identifier(this.secondLocalKey)} from ${throughTable} where ${sql.identifier(this.firstKey)} = ${parentCtor.table}.${sql.identifier(this.localKey)})`;
        return this.correlated(parentCtor, b, link);
    }
}

/* ---------------------------------------------------------------------- *
 * Public factory functions
 * ---------------------------------------------------------------------- */

export const belongsTo = (related: () => ModelCtor<any>, foreignKey: string, ownerKey?: string) => new BelongsTo(related, foreignKey, ownerKey);
export const hasOne = (related: () => ModelCtor<any>, foreignKey: string, localKey?: string) => new HasOneOrMany(related, foreignKey, localKey, false);
export const hasMany = (related: () => ModelCtor<any>, foreignKey: string, localKey?: string) => new HasOneOrMany(related, foreignKey, localKey, true);
export const morphMany = (related: () => ModelCtor<any>, name: string, localKey?: string) => new Morph(related, name, true, localKey);
export const morphOne = (related: () => ModelCtor<any>, name: string, localKey?: string) => new Morph(related, name, false, localKey);
export const morphTo = (name: string) => new MorphTo(name);
export const belongsToMany = (
    related: () => ModelCtor<any>,
    pivotTable: string,
    foreignPivotKey: string,
    relatedPivotKey: string,
    parentKey?: string,
    relatedKey?: string,
) => new BelongsToMany(related, pivotTable, foreignPivotKey, relatedPivotKey, parentKey, relatedKey);
export const hasManyThrough = (
    related: () => ModelCtor<any>,
    through: () => ModelCtor<any>,
    firstKey: string,
    secondKey: string,
    localKey: string,
    secondLocalKey: string,
    throughScope?: Scope,
) => new HasManyThrough(related, through, firstKey, secondKey, localKey, secondLocalKey, throughScope);

export { BelongsToMany };
export { getTableName };
