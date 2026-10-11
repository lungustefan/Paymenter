import {
    getTableColumns,
    getTableName,
    sql,
    type SQL,
} from 'drizzle-orm';
import type { MySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import { Carbon } from '@/server/lib/carbon';
import { formatDbDate } from '@/server/lib/time';
import { currentDb } from './context';
import type { Model } from './model';
import type { RelationDef } from './relations';

/** The static surface the query builder / relations need from a model class. */
export interface ModelStatics {
    table: MySqlTable;
    name: string;
    morphName: string;
    primaryKey: string;
    incrementing: boolean;
    timestamps: boolean;
    softDeletes: boolean;
    uniqueIds: string[];
    relations: Record<string, RelationDef>;
    globalScopes: Array<(q: Builder<any>) => void>;
    ensureBooted(): void;
    columnNames(): string[];
    newFromRow(row: Record<string, any>): Promise<any>;
    loadRelations(models: Model<any>[], names: string[], force?: boolean): Promise<void>;
    prepareForWrite(values: Record<string, any>): Record<string, any>;
    query<M extends Model<any>>(this: ModelCtor<M>): Builder<M>;
}

export type ModelCtor<M extends Model<any> = Model<any>> = (new (attributes?: Record<string, any>) => M) & ModelStatics;

type Operator = '=' | '!=' | '<>' | '<' | '>' | '<=' | '>=' | 'like' | 'not like' | 'LIKE' | 'NOT LIKE';

interface Clause {
    boolean: 'and' | 'or';
    sql: SQL;
}

export interface Paginated<M> {
    data: M[];
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
}

export interface SimplePaginated<M> {
    data: M[];
    per_page: number;
    current_page: number;
    has_more_pages: boolean;
}

/** Convert a JS value into something safe to bind to a raw SQL parameter. */
export function bind(value: unknown): unknown {
    if (value instanceof Carbon) return formatDbDate(value.toDate());
    if (value instanceof Date) return formatDbDate(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value !== null && typeof value === 'object') return JSON.stringify(value);
    return value;
}

export class Builder<M extends Model<any>, Ctor extends ModelCtor<M> = ModelCtor<M>> {
    protected clauses: Clause[] = [];
    protected orders: SQL[] = [];
    protected limitValue: number | null = null;
    protected offsetValue: number | null = null;
    protected eager: string[] = [];
    protected lock: 'update' | 'share' | null = null;
    protected withTrashedFlag = false;
    protected onlyTrashedFlag = false;
    protected scopesApplied = false;
    protected groupColumns: SQL[] = [];

    constructor(public readonly model: Ctor) {}

    get table(): MySqlTable {
        return this.model.table;
    }

    get tableName(): string {
        return getTableName(this.table);
    }

    protected columns(): Record<string, MySqlColumn> {
        return getTableColumns(this.table) as Record<string, MySqlColumn>;
    }

    /** Resolve `col` or `table.col` to a Drizzle column. */
    col(name: string): MySqlColumn {
        const clean = name.includes('.') ? name.split('.').pop()! : name;
        const column = this.columns()[clean];
        if (!column) throw new Error(`Unknown column "${name}" on table "${this.tableName}"`);
        return column;
    }

    /** `col`, or `json_unquote(json_extract(col, '$."a"."b"'))` for a JSON path (`context->a->b`) */
    colSql(name: string): SQL {
        if (!name.includes('->')) return sql`${this.col(name)}`;
        const [column, ...path] = name.split('->');
        const jsonPath = '$' + path.map((p) => `."${p.replace(/"/g, '\\"')}"`).join('');
        return sql`json_unquote(json_extract(${this.col(column)}, ${jsonPath}))`;
    }

    clone(): this {
        const c = Object.create(Object.getPrototypeOf(this)) as this;
        Object.assign(c, this);
        c.clauses = [...this.clauses];
        c.orders = [...this.orders];
        c.eager = [...this.eager];
        c.groupColumns = [...this.groupColumns];
        c.scopesApplied = false;
        return c;
    }

    /* ------------------------------------------------------------------ *
     * WHERE
     * ------------------------------------------------------------------ */

    protected push(boolean: 'and' | 'or', expr: SQL) {
        this.clauses.push({ boolean, sql: expr });
        return this;
    }

    /** Compile this builder's wheres into a single grouped SQL fragment. */
    compileWheres(): SQL | undefined {
        if (this.clauses.length === 0) return undefined;
        let acc: SQL | undefined;
        for (const c of this.clauses) {
            acc = acc ? sql`${acc} ${sql.raw(c.boolean)} ${c.sql}` : c.sql;
        }
        return acc;
    }

    protected whereClause(boolean: 'and' | 'or', column: any, operator?: any, value?: any) {
        // where(fn) - grouped conditions
        if (typeof column === 'function') {
            const nested = this.newNested();
            column(nested);
            const compiled = nested.compileWheres();
            return compiled ? this.push(boolean, sql`(${compiled})`) : this;
        }
        // where({a: 1, b: 2})
        if (column && typeof column === 'object' && !(column instanceof Carbon)) {
            for (const [k, v] of Object.entries(column)) this.whereClause(boolean, k, '=', v);
            return this;
        }
        if (value === undefined && !['=', '!=', '<>', '<', '>', '<=', '>=', 'like', 'not like', 'LIKE', 'NOT LIKE'].includes(operator)) {
            value = operator;
            operator = '=';
        }
        if (value === null) {
            return this.push(boolean, operator === '=' || operator === undefined ? sql`${this.colSql(column)} is null` : sql`${this.colSql(column)} is not null`);
        }
        const op = sql.raw(String(operator ?? '='));
        return this.push(boolean, sql`${this.colSql(column)} ${op} ${bind(value)}`);
    }

    newNested(): Builder<M, Ctor> {
        return new Builder<M, Ctor>(this.model);
    }

    where(column: string | ((q: Builder<M, Ctor>) => void) | Record<string, any>, operator?: Operator | unknown, value?: unknown): this {
        return this.whereClause('and', column, operator, value) as this;
    }

    orWhere(column: string | ((q: Builder<M, Ctor>) => void) | Record<string, any>, operator?: Operator | unknown, value?: unknown): this {
        return this.whereClause('or', column, operator, value) as this;
    }

    whereNot(column: string, value: unknown): this {
        return this.whereClause('and', column, '!=', value) as this;
    }

    whereKey(id: unknown): this {
        return this.where(this.model.primaryKey, id);
    }

    whereIn(column: string, values: unknown[]): this {
        if (values.length === 0) return this.push('and', sql`1 = 0`);
        return this.push('and', sql`${this.col(column)} in (${sql.join(values.map((v) => sql`${bind(v)}`), sql`, `)})`);
    }

    orWhereIn(column: string, values: unknown[]): this {
        if (values.length === 0) return this.push('or', sql`1 = 0`);
        return this.push('or', sql`${this.col(column)} in (${sql.join(values.map((v) => sql`${bind(v)}`), sql`, `)})`);
    }

    whereNotIn(column: string, values: unknown[]): this {
        if (values.length === 0) return this.push('and', sql`1 = 1`);
        return this.push('and', sql`${this.col(column)} not in (${sql.join(values.map((v) => sql`${bind(v)}`), sql`, `)})`);
    }

    whereNull(column: string): this {
        return this.push('and', sql`${this.col(column)} is null`);
    }

    orWhereNull(column: string): this {
        return this.push('or', sql`${this.col(column)} is null`);
    }

    whereNotNull(column: string): this {
        return this.push('and', sql`${this.col(column)} is not null`);
    }

    whereBetween(column: string, [a, b]: [unknown, unknown]): this {
        return this.push('and', sql`${this.col(column)} between ${bind(a)} and ${bind(b)}`);
    }

    whereDate(column: string, operator: Operator, value: Carbon | Date | string): this {
        const v = value instanceof Carbon ? value.toDateString() : value instanceof Date ? formatDbDate(value).slice(0, 10) : value;
        return this.push('and', sql`date(${this.col(column)}) ${sql.raw(operator)} ${v}`);
    }

    whereRaw(expression: SQL): this {
        return this.push('and', expression);
    }

    orWhereRaw(expression: SQL): this {
        return this.push('or', expression);
    }

    when<T>(condition: T, callback: (q: this, value: NonNullable<T>) => void, otherwise?: (q: this) => void): this {
        if (condition) callback(this, condition as NonNullable<T>);
        else if (otherwise) otherwise(this);
        return this;
    }

    /** `has()` / `whereHas()` / `whereDoesntHave()` via a correlated EXISTS subquery. */
    protected existsClause(boolean: 'and' | 'or', relation: string, callback?: (q: Builder<any>) => void, negate = false, operator = '>=', count = 1): this {
        const def = this.model.relations[relation];
        if (!def) throw new Error(`Relation "${relation}" is not defined on ${this.model.name}`);
        const sub = def.exists(this.model, callback);
        const countMode = !(operator === '>=' && count === 1);
        if (countMode) {
            return this.push(boolean, sql`(select count(*) from (${sub.select}) as _c) ${sql.raw(operator)} ${count}`) as this;
        }
        return this.push(boolean, negate ? sql`not exists (${sub.select})` : sql`exists (${sub.select})`) as this;
    }

    has(relation: string, operator = '>=', count = 1): this {
        return this.existsClause('and', relation, undefined, false, operator, count);
    }
    doesntHave(relation: string): this {
        return this.existsClause('and', relation, undefined, true);
    }
    whereHas(relation: string, callback?: (q: Builder<any>) => void, operator = '>=', count = 1): this {
        return this.existsClause('and', relation, callback, false, operator, count);
    }
    orWhereHas(relation: string, callback?: (q: Builder<any>) => void): this {
        return this.existsClause('or', relation, callback, false);
    }
    whereDoesntHave(relation: string, callback?: (q: Builder<any>) => void): this {
        return this.existsClause('and', relation, callback, true);
    }

    /* ------------------------------------------------------------------ *
     * ORDER / LIMIT / MISC
     * ------------------------------------------------------------------ */

    orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
        this.orders.push(sql`${this.col(column)} ${sql.raw(direction.toLowerCase() === 'desc' ? 'desc' : 'asc')}`);
        return this;
    }

    orderByDesc(column: string): this {
        return this.orderBy(column, 'desc');
    }

    orderByRaw(expression: SQL): this {
        this.orders.push(expression);
        return this;
    }

    latest(column = 'created_at'): this {
        return this.orderBy(column, 'desc');
    }

    oldest(column = 'created_at'): this {
        return this.orderBy(column, 'asc');
    }

    inRandomOrder(): this {
        this.orders.push(sql`rand()`);
        return this;
    }

    groupBy(...columns: string[]): this {
        this.groupColumns.push(...columns.map((c) => sql`${this.col(c)}`));
        return this;
    }

    limit(n: number): this {
        this.limitValue = n;
        return this;
    }
    take(n: number): this {
        return this.limit(n);
    }
    offset(n: number): this {
        this.offsetValue = n;
        return this;
    }
    skip(n: number): this {
        return this.offset(n);
    }

    lockForUpdate(): this {
        this.lock = 'update';
        return this;
    }
    sharedLock(): this {
        this.lock = 'share';
        return this;
    }

    with(...relations: (string | string[])[]): this {
        for (const r of relations.flat()) if (!this.eager.includes(r)) this.eager.push(r);
        return this;
    }

    withTrashed(): this {
        this.withTrashedFlag = true;
        return this;
    }
    onlyTrashed(): this {
        this.onlyTrashedFlag = true;
        return this;
    }

    /** Apply the model's global scopes (soft deletes, type constraints) once. */
    protected applyScopes(): this {
        if (this.scopesApplied) return this;
        this.scopesApplied = true;
        // global scopes are AND-ed in front of user clauses and must not change OR precedence: wrap user clauses
        const user = this.compileWheres();
        const extra: SQL[] = [];
        for (const scope of this.model.globalScopes) {
            const nested = this.newNested();
            scope(nested as any);
            const compiled = nested.compileWheres();
            if (compiled) extra.push(compiled);
        }
        if (this.model.softDeletes && !this.withTrashedFlag) {
            const deletedAt = this.columns().deleted_at;
            if (deletedAt) extra.push(this.onlyTrashedFlag ? sql`${deletedAt} is not null` : sql`${deletedAt} is null`);
        }
        if (extra.length) {
            this.clauses = [];
            const all = sql.join(extra.map((e) => sql`(${e})`), sql` and `);
            this.clauses.push({ boolean: 'and', sql: user ? sql`${all} and (${user})` : all });
        }
        return this;
    }

    toSql(): SQL {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        return sql`select * from ${this.table}${where ? sql` where ${where}` : sql``}`;
    }

    /* ------------------------------------------------------------------ *
     * READ
     * ------------------------------------------------------------------ */

    protected selectQuery() {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        let q: any = currentDb().select().from(this.table);
        if (where) q = q.where(where);
        if (c.groupColumns.length) q = q.groupBy(...c.groupColumns);
        const orders = c.orders.length ? c.orders : this.defaultOrders();
        if (orders.length) q = q.orderBy(...orders);
        if (c.limitValue !== null) q = q.limit(c.limitValue);
        if (c.offsetValue !== null) q = q.offset(c.offsetValue);
        if (c.lock) q = q.for(c.lock);
        return q;
    }

    /** the order used when none was asked for (a relation through a pivot table follows the pivot rows) */
    protected defaultOrders(): SQL[] {
        return [];
    }

    async get(): Promise<M[]> {
        const rows: Record<string, any>[] = await this.selectQuery();
        const models = (await Promise.all(rows.map((r) => this.model.newFromRow(r)))) as M[];
        if (this.eager.length && models.length) await this.model.loadRelations(models, this.eager);
        return models;
    }

    async first(): Promise<M | null> {
        const rows = await this.clone().limit(1).get();
        return rows[0] ?? null;
    }

    async firstOrFail(): Promise<M> {
        const m = await this.first();
        if (!m) throw new ModelNotFoundError(this.model.name);
        return m;
    }

    async firstOr<T>(fallback: () => T): Promise<M | T> {
        return (await this.first()) ?? fallback();
    }

    async find(id: unknown): Promise<M | null> {
        return this.clone().where(this.model.primaryKey, id).first();
    }

    async findOrFail(id: unknown): Promise<M> {
        const m = await this.find(id);
        if (!m) throw new ModelNotFoundError(this.model.name, id);
        return m;
    }

    async findMany(ids: unknown[]): Promise<M[]> {
        if (ids.length === 0) return [];
        return this.clone().whereIn(this.model.primaryKey, ids).get();
    }

    async firstWhere(column: string, operator?: unknown, value?: unknown): Promise<M | null> {
        return this.clone().where(column, operator as any, value).first();
    }

    async all(): Promise<M[]> {
        return this.get();
    }

    protected async aggregate(fn: string, column = '*'): Promise<number | null> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        const target = column === '*' ? sql.raw('*') : sql`${this.col(column)}`;
        const query = sql`select ${sql.raw(fn)}(${target}) as aggregate from ${this.table}${where ? sql` where ${where}` : sql``}`;
        const [rows] = (await currentDb().execute(query)) as any;
        const v = rows?.[0]?.aggregate;
        return v === null || v === undefined ? null : Number(v);
    }

    /** `select <date> as date, <aggregate> as aggregate ... group by <date> order by date` (the Trend helper) */
    async aggregateByDate(dateExpr: SQL, aggregateExpr: SQL): Promise<Array<{ date: string; aggregate: any }>> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        const query = sql`select ${dateExpr} as date, ${aggregateExpr} as aggregate from ${this.table}${where ? sql` where ${where}` : sql``} group by ${dateExpr} order by date`;
        const [rows] = (await currentDb().execute(query)) as any;
        return rows;
    }

    async count(column = '*'): Promise<number> {
        return (await this.aggregate('count', column)) ?? 0;
    }
    async sum(column: string): Promise<number> {
        return (await this.aggregate('sum', column)) ?? 0;
    }
    async avg(column: string): Promise<number | null> {
        return this.aggregate('avg', column);
    }
    async max(column: string): Promise<number | null> {
        return this.aggregate('max', column);
    }
    async min(column: string): Promise<number | null> {
        return this.aggregate('min', column);
    }
    async exists(): Promise<boolean> {
        return (await this.count()) > 0;
    }
    async doesntExist(): Promise<boolean> {
        return !(await this.exists());
    }

    async pluck<T = any>(column: string, key?: string): Promise<T[] | Record<string, T>> {
        const rows = await this.get();
        if (key) {
            const out: Record<string, T> = {};
            for (const r of rows) out[String((r as any)[key])] = (r as any)[column];
            return out;
        }
        return rows.map((r) => (r as any)[column]);
    }

    async pluckList<T = any>(column: string): Promise<T[]> {
        return (await this.pluck<T>(column)) as T[];
    }

    async value<T = any>(column: string): Promise<T | null> {
        const m = await this.clone().limit(1).get();
        return m[0] ? ((m[0] as any)[column] ?? null) : null;
    }

    async paginate(perPage = 15, page = 1): Promise<Paginated<M>> {
        const total = await this.clone().count();
        const data = await this.clone()
            .offset((page - 1) * perPage)
            .limit(perPage)
            .get();
        const last = Math.max(1, Math.ceil(total / perPage));
        return {
            data,
            total,
            per_page: perPage,
            current_page: page,
            last_page: last,
            from: total === 0 ? null : (page - 1) * perPage + 1,
            to: total === 0 ? null : (page - 1) * perPage + data.length,
        };
    }

    async simplePaginate(perPage = 15, page = 1): Promise<SimplePaginated<M>> {
        const rows = await this.clone()
            .offset((page - 1) * perPage)
            .limit(perPage + 1)
            .get();
        return {
            data: rows.slice(0, perPage),
            per_page: perPage,
            current_page: page,
            has_more_pages: rows.length > perPage,
        };
    }

    async chunk(size: number, callback: (models: M[]) => Promise<void | false> | void | false): Promise<void> {
        let page = 1;
        for (;;) {
            const rows = await this.clone().offset((page - 1) * size).limit(size).get();
            if (rows.length === 0) break;
            if ((await callback(rows)) === false) break;
            if (rows.length < size) break;
            page++;
        }
    }

    async each(callback: (model: M) => Promise<void | false> | void | false, size = 1000): Promise<void> {
        await this.chunk(size, async (rows) => {
            for (const r of rows) if ((await callback(r)) === false) return false;
        });
    }

    /* ------------------------------------------------------------------ *
     * WRITE (bulk - no model events, like Eloquent's builder)
     * ------------------------------------------------------------------ */

    async update(values: Record<string, any>): Promise<number> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        const set: Record<string, any> = { ...values };
        if (this.model.timestamps && this.columns().updated_at && !('updated_at' in set)) {
            set.updated_at = Carbon.now();
        }
        const mapped = this.model.prepareForWrite(set);
        let q: any = currentDb().update(this.table).set(mapped);
        if (where) q = q.where(where);
        const [res] = await q;
        return Number(res?.affectedRows ?? 0);
    }

    async delete(): Promise<number> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        if (this.model.softDeletes) {
            return this.update({ deleted_at: Carbon.now() });
        }
        let q: any = currentDb().delete(this.table);
        if (where) q = q.where(where);
        const [res] = await q;
        return Number(res?.affectedRows ?? 0);
    }

    async forceDelete(): Promise<number> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        let q: any = currentDb().delete(this.table);
        if (where) q = q.where(where);
        const [res] = await q;
        return Number(res?.affectedRows ?? 0);
    }

    async increment(column: string, amount = 1, extra: Record<string, any> = {}): Promise<number> {
        const c = this.clone().applyScopes();
        const where = c.compileWheres();
        const col = this.col(column);
        const set: Record<string, any> = { ...this.model.prepareForWrite(extra), [column]: sql`${col} + ${amount}` };
        if (this.model.timestamps && this.columns().updated_at && !('updated_at' in extra)) set.updated_at = Carbon.now();
        let q: any = currentDb().update(this.table).set(set);
        if (where) q = q.where(where);
        const [res] = await q;
        return Number(res?.affectedRows ?? 0);
    }

    async decrement(column: string, amount = 1, extra: Record<string, any> = {}): Promise<number> {
        return this.increment(column, -amount, extra);
    }

    /** Insert one or many rows without model events (Eloquent `insert()`). */
    async insert(rows: Record<string, any> | Record<string, any>[]): Promise<void> {
        const list = Array.isArray(rows) ? rows : [rows];
        if (list.length === 0) return;
        await currentDb()
            .insert(this.table)
            .values(list.map((r) => this.model.prepareForWrite(r)) as any);
    }

    async upsert(rows: Record<string, any>[], uniqueBy: string[], update?: string[]): Promise<void> {
        if (rows.length === 0) return;
        const cols = update ?? Object.keys(rows[0]).filter((k) => !uniqueBy.includes(k));
        const set: Record<string, any> = {};
        for (const c of cols) set[c] = sql`values(${this.col(c)})`;
        await currentDb()
            .insert(this.table)
            .values(rows.map((r) => this.model.prepareForWrite(r)) as any)
            .onDuplicateKeyUpdate({ set });
    }

    /* ------------------------------------------------------------------ *
     * Model-aware writes (fire model events)
     * ------------------------------------------------------------------ */

    async create(attributes: Record<string, any>): Promise<M> {
        const m = new this.model() as M;
        await this.beforeCreate(m);
        m.fill(attributes);
        await m.save();
        return m;
    }

    /** Hook for relation builders to inject foreign keys. */
    protected async beforeCreate(_model: M): Promise<void> {}

    async firstOrNew(attributes: Record<string, any>, values: Record<string, any> = {}): Promise<M> {
        const found = await this.clone().where(attributes).first();
        if (found) return found;
        const m = new this.model() as M;
        await this.beforeCreate(m);
        m.fill({ ...attributes, ...values });
        return m;
    }

    async firstOrCreate(attributes: Record<string, any>, values: Record<string, any> = {}): Promise<M> {
        const m = await this.firstOrNew(attributes, values);
        if (!m.$exists) await m.save();
        return m;
    }

    async updateOrCreate(attributes: Record<string, any>, values: Record<string, any> = {}): Promise<M> {
        const m = await this.firstOrNew(attributes);
        m.fill(values);
        await m.save();
        return m;
    }
}

export class ModelNotFoundError extends Error {
    status = 404;
    constructor(public modelName: string, public id?: unknown) {
        super(`No query results for model [${modelName}]${id !== undefined ? ` ${id}` : ''}`);
        this.name = 'ModelNotFoundError';
    }
}
