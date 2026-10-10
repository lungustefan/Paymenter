import { eq, getTableColumns, getTableName, type SQL } from 'drizzle-orm';
import type { MySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core';
import { Carbon } from '@/server/lib/carbon';
import { decryptString, encryptString, hashPassword } from '@/server/lib/crypto';
import { ulid } from '@/server/lib/ids';
import { Builder, ModelNotFoundError, type ModelCtor } from './builder';
import { afterCommit, currentDb } from './context';
import { recordAudit, type CustomAudit } from './audit';
import { registerModel } from './registry';
import type { RelationDef, RelationBuilder } from './relations';
import { BelongsToMany } from './relations';

type Listener = (model: any) => unknown | Promise<unknown>;

export type ModelEvent =
    | 'retrieved'
    | 'saving'
    | 'saved'
    | 'creating'
    | 'created'
    | 'updating'
    | 'updated'
    | 'deleting'
    | 'deleted'
    | 'restoring'
    | 'restored';

const listenerRegistry = new WeakMap<object, Map<string, Listener[]>>();
const bootedClasses = new WeakSet<object>();
let eventsMuted = 0;

/** `Model::withoutEvents()` */
export async function withoutEvents<T>(fn: () => Promise<T>): Promise<T> {
    eventsMuted++;
    try {
        return await fn();
    } finally {
        eventsMuted--;
    }
}

function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    if (a instanceof Carbon && b instanceof Carbon) return a.valueOf() === b.valueOf();
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    // numeric strings vs numbers (decimal columns)
    if ((typeof a === 'number' && typeof b === 'string') || (typeof a === 'string' && typeof b === 'number')) return Number(a) === Number(b);
    return false;
}

function cloneValue(v: unknown): unknown {
    if (v === null || typeof v !== 'object' || v instanceof Carbon || v instanceof Date) return v;
    return JSON.parse(JSON.stringify(v));
}

const BCRYPT_RE = /^\$2[abxy]\$\d{2}\$.{53}$/;

/**
 * Eloquent-style active record on top of Drizzle.
 *
 * Column values live directly on the instance (`invoice.status`), `$original`
 * keeps the persisted snapshot for dirty tracking, loaded relations live in
 * `$relations`. Accessors ("computed attributes") are async methods listed in
 * `static accessors`.
 */
export class Model<R extends Record<string, any> = Record<string, any>> {
    /* ---- static configuration (override in subclasses) ---- */
    static table: MySqlTable;
    static morphName: string;
    static primaryKey = 'id';
    static incrementing = true;
    static timestamps = true;
    static softDeletes = false;
    /** `null` means "use guarded". */
    static fillable: string[] | null = null;
    /** `['*']` guards everything (Laravel default), `[]` allows everything. */
    static guarded: string[] = ['*'];
    static hidden: string[] = [];
    static appends: string[] = [];
    static casts: Record<string, string> = {};
    static relations: Record<string, RelationDef> = {};
    static accessors: string[] = [];
    /** attribute name -> accessor method, for names that collide with a column (e.g. `label`) */
    static accessorMap: Record<string, string> = {};
    static observers: any[] = [];
    /** attributes generated as ULIDs on create (`HasUlids::uniqueIds`) */
    static uniqueIds: string[] = [];
    static globalScopes: Array<(q: Builder<any>) => void> = [];

    static auditable = false;
    static auditInclude: string[] = [];
    static auditExclude: string[] = [];

    /** Hook to register model listeners (`booted()` in Eloquent). */
    static booted(): void {}

    /* ---- instance state ---- */
    $original: Record<string, any> = {};
    $exists = false;
    $relations: Record<string, any> = {};
    $changes: Record<string, any> = {};
    $wasRecentlyCreated = false;

    constructor(attributes?: Record<string, any>) {
        this.ctor.ensureBooted();
        if (attributes) this.fill(attributes);
    }

    get ctor(): typeof Model {
        return this.constructor as typeof Model;
    }

    /* ------------------------------------------------------------------ *
     * Statics: booting, events
     * ------------------------------------------------------------------ */

    static ensureBooted() {
        if (bootedClasses.has(this)) return;
        bootedClasses.add(this);
        registerModel(this as any);
        for (const observer of this.observers) {
            const obs = typeof observer === 'function' ? new observer() : observer;
            for (const ev of ['retrieved', 'saving', 'saved', 'creating', 'created', 'updating', 'updated', 'deleting', 'deleted', 'restoring', 'restored']) {
                if (typeof obs[ev] === 'function') this.on(ev as ModelEvent, (m: any) => obs[ev](m));
            }
        }
        this.booted();
    }

    static on(event: ModelEvent, listener: Listener) {
        let map = listenerRegistry.get(this);
        if (!map) listenerRegistry.set(this, (map = new Map()));
        const list = map.get(event) ?? [];
        list.push(listener);
        map.set(event, list);
    }

    static creating(fn: Listener) { this.on('creating', fn); }
    static created(fn: Listener) { this.on('created', fn); }
    static updating(fn: Listener) { this.on('updating', fn); }
    static updated(fn: Listener) { this.on('updated', fn); }
    static saving(fn: Listener) { this.on('saving', fn); }
    static saved(fn: Listener) { this.on('saved', fn); }
    static deleting(fn: Listener) { this.on('deleting', fn); }
    static deleted(fn: Listener) { this.on('deleted', fn); }

    protected async fire(event: ModelEvent): Promise<boolean> {
        if (eventsMuted > 0) return true;
        const list = listenerRegistry.get(this.ctor)?.get(event) ?? [];
        for (const l of list) {
            const r = await l(this);
            if (r === false) return false;
        }
        return true;
    }

    /* ------------------------------------------------------------------ *
     * Statics: query entry points
     * ------------------------------------------------------------------ */

    static columnNames(): string[] {
        return Object.keys(getTableColumns(this.table));
    }

    static get tableName(): string {
        return getTableName(this.table);
    }

    static query<M extends Model<any>>(this: ModelCtor<M>): Builder<M> {
        this.ensureBooted();
        return new Builder<M>(this);
    }

    static with<M extends Model<any>>(this: ModelCtor<M>, ...relations: string[]): Builder<M> {
        return (this.query() as Builder<M>).with(...relations);
    }

    static where<M extends Model<any>>(this: ModelCtor<M>, column: any, operator?: any, value?: any): Builder<M> {
        return (this.query() as Builder<M>).where(column, operator, value);
    }

    static whereIn<M extends Model<any>>(this: ModelCtor<M>, column: string, values: unknown[]): Builder<M> {
        return (this.query() as Builder<M>).whereIn(column, values);
    }

    static async find<M extends Model<any>>(this: ModelCtor<M>, id: unknown): Promise<M | null> {
        if (id === null || id === undefined) return null;
        return (this.query() as Builder<M>).find(id);
    }

    static async findOrFail<M extends Model<any>>(this: ModelCtor<M>, id: unknown): Promise<M> {
        return (this.query() as Builder<M>).findOrFail(id);
    }

    static async all<M extends Model<any>>(this: ModelCtor<M>): Promise<M[]> {
        return (this.query() as Builder<M>).get();
    }

    static async count(this: ModelCtor<any>): Promise<number> {
        return (this as any).query().count();
    }

    static async create<M extends Model<any>>(this: ModelCtor<M>, attributes: Record<string, any>): Promise<M> {
        return (this.query() as Builder<M>).create(attributes);
    }

    static async firstOrCreate<M extends Model<any>>(this: ModelCtor<M>, attributes: Record<string, any>, values: Record<string, any> = {}): Promise<M> {
        return (this.query() as Builder<M>).firstOrCreate(attributes, values);
    }

    static async updateOrCreate<M extends Model<any>>(this: ModelCtor<M>, attributes: Record<string, any>, values: Record<string, any> = {}): Promise<M> {
        return (this.query() as Builder<M>).updateOrCreate(attributes, values);
    }

    static async firstWhere<M extends Model<any>>(this: ModelCtor<M>, column: string, operator?: unknown, value?: unknown): Promise<M | null> {
        return (this.query() as Builder<M>).firstWhere(column, operator, value);
    }

    /* ------------------------------------------------------------------ *
     * Hydration / persistence helpers
     * ------------------------------------------------------------------ */

    static async newFromRow<M extends Model<any>>(this: ModelCtor<M>, row: Record<string, any>): Promise<M> {
        const m = new this() as M;
        Object.assign(m, row);
        m.$exists = true;
        m.applyReadCasts();
        m.syncOriginal();
        await m.fire('retrieved' as ModelEvent);
        return m;
    }

    /** Convert values coming from user code into what the driver expects. */
    static prepareForWrite(values: Record<string, any>): Record<string, any> {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(values)) {
            if (v === undefined) continue;
            out[k] = v;
        }
        return out;
    }

    /** Attribute value redaction used by auditing (see Setting). */
    static attributeModifiers(_model: Model<any>): Record<string, (value: any) => any> {
        return {};
    }

    protected applyReadCasts() {
        const casts = this.ctor.casts;
        for (const [attr, cast] of Object.entries(casts)) {
            const v = (this as any)[attr];
            if (v === null || v === undefined) continue;
            if (cast === 'encrypted') {
                try {
                    (this as any)[attr] = decryptString(String(v));
                } catch {
                    (this as any)[attr] = null;
                }
            } else if (cast === 'date' && v instanceof Carbon) {
                (this as any)[attr] = v.startOfDay();
            } else if (cast === 'integer') {
                (this as any)[attr] = Number.parseInt(String(v), 10);
            } else if (cast === 'float') {
                (this as any)[attr] = Number(v);
            } else if (cast === 'boolean') {
                (this as any)[attr] = Boolean(Number(v) || v === true);
            }
        }
    }

    protected valuesForWrite(attrs: string[]): Record<string, any> {
        const out: Record<string, any> = {};
        const casts = this.ctor.casts;
        for (const attr of attrs) {
            let v = (this as any)[attr];
            const cast = casts[attr];
            if (v !== null && v !== undefined) {
                if (cast === 'encrypted') {
                    v = encryptString(String(v));
                } else if (cast === 'hashed') {
                    if (!BCRYPT_RE.test(String(v))) {
                        v = hashPassword(String(v));
                        (this as any)[attr] = v;
                    }
                }
            }
            out[attr] = v;
        }
        return out;
    }

    /* ------------------------------------------------------------------ *
     * Attributes
     * ------------------------------------------------------------------ */

    fill(attributes: Record<string, any>): this {
        const C = this.ctor;
        const cols = new Set(C.columnNames());
        for (const [key, value] of Object.entries(attributes)) {
            if (!this.isFillable(key)) continue;
            // unknown keys are ignored (Eloquent would try the column and fail on save)
            if (!cols.has(key)) {
                (this as any)[key] = value;
                continue;
            }
            (this as any)[key] = value;
        }
        return this;
    }

    forceFill(attributes: Record<string, any>): this {
        Object.assign(this, attributes);
        return this;
    }

    isFillable(key: string): boolean {
        const C = this.ctor;
        if (C.fillable) return C.fillable.includes(key);
        if (C.guarded.length === 0) return true;
        if (C.guarded.includes('*')) return false;
        return !C.guarded.includes(key);
    }

    getAttributes(): Record<string, any> {
        const out: Record<string, any> = {};
        for (const c of this.ctor.columnNames()) if (c in this) out[c] = (this as any)[c];
        return out;
    }

    syncOriginal(): this {
        const o: Record<string, any> = {};
        for (const c of this.ctor.columnNames()) o[c] = cloneValue((this as any)[c]);
        this.$original = o;
        return this;
    }

    getOriginal(key?: string): any {
        return key ? this.$original[key] : this.$original;
    }

    getDirty(): Record<string, any> {
        const dirty: Record<string, any> = {};
        for (const c of this.ctor.columnNames()) {
            const cur = (this as any)[c];
            if (cur === undefined) continue;
            if (!this.$exists || !(c in this.$original) || !valuesEqual(cur, this.$original[c])) dirty[c] = cur;
        }
        return dirty;
    }

    isDirty(...keys: string[]): boolean {
        const dirty = this.getDirty();
        if (keys.length === 0) return Object.keys(dirty).length > 0;
        return keys.some((k) => k in dirty);
    }

    isClean(...keys: string[]): boolean {
        return !this.isDirty(...keys);
    }

    wasChanged(...keys: string[]): boolean {
        if (keys.length === 0) return Object.keys(this.$changes).length > 0;
        return keys.some((k) => k in this.$changes);
    }

    getChanges(): Record<string, any> {
        return this.$changes;
    }

    getKey(): any {
        return (this as any)[this.ctor.primaryKey];
    }

    /** Eloquent's `is()`. */
    is(other: Model<any> | null | undefined): boolean {
        return !!other && other.ctor === this.ctor && String(other.getKey()) === String(this.getKey());
    }

    /* ------------------------------------------------------------------ *
     * Persistence
     * ------------------------------------------------------------------ */

    async save(options: { quietly?: boolean; touch?: boolean } = {}): Promise<this> {
        const C = this.ctor;
        const run = async () => {
            if ((await this.fire('saving')) === false) return;
            let saved = true;
            if (this.$exists) {
                if (this.isDirty()) saved = await this.performUpdate();
            } else {
                saved = await this.performInsert();
            }
            if (saved) {
                await this.fire('saved');
                this.syncOriginal();
            }
        };
        if (options.quietly) await withoutEvents(run);
        else await run();
        void C;
        return this;
    }

    async saveQuietly(): Promise<this> {
        return this.save({ quietly: true });
    }

    private async performInsert(): Promise<boolean> {
        const C = this.ctor;
        if ((await this.fire('creating')) === false) return false;

        const now = Carbon.now();
        const cols = C.columnNames();
        if (C.timestamps) {
            if (cols.includes('created_at') && (this as any).created_at == null) (this as any).created_at = now;
            if (cols.includes('updated_at') && (this as any).updated_at == null) (this as any).updated_at = now;
        }
        for (const u of C.uniqueIds) if (!(this as any)[u]) (this as any)[u] = ulid();

        const attrs = cols.filter((c) => (this as any)[c] !== undefined && !(C.incrementing && c === C.primaryKey && (this as any)[c] == null));
        const values = this.valuesForWrite(attrs);
        const [res] = (await currentDb().insert(C.table).values(values as any)) as any;
        if (C.incrementing && res?.insertId && (this as any)[C.primaryKey] == null) {
            (this as any)[C.primaryKey] = Number(res.insertId);
        }
        // Fill DB defaults the way a re-hydration would (columns not provided)
        await this.hydrateDefaults(cols, attrs);

        this.$exists = true;
        this.$wasRecentlyCreated = true;
        await this.fire('created');
        await recordAudit(this, 'created');
        return true;
    }

    /** After an insert, load columns that the database defaulted (e.g. `status`). */
    private async hydrateDefaults(cols: string[], provided: string[]) {
        const missing = cols.filter((c) => !provided.includes(c) && (this as any)[c] === undefined);
        if (missing.length === 0) return;
        const C = this.ctor;
        const [row] = (await currentDb().select().from(C.table).where(eqPk(C, (this as any)[C.primaryKey])).limit(1)) as any[];
        if (row) for (const c of missing) (this as any)[c] = row[c];
    }

    private async performUpdate(): Promise<boolean> {
        const C = this.ctor;
        if ((await this.fire('updating')) === false) return false;

        if (C.timestamps && C.columnNames().includes('updated_at') && !this.isDirty('updated_at')) {
            (this as any).updated_at = Carbon.now();
        }
        const dirty = this.getDirty();
        const keys = Object.keys(dirty).filter((k) => k !== C.primaryKey);
        if (keys.length > 0) {
            const values = this.valuesForWrite(keys);
            await currentDb()
                .update(C.table)
                .set(values as any)
                .where(eqPk(C, this.getKey()));
            this.$changes = dirty;
            await this.fire('updated');
            await recordAudit(this, 'updated');
        }
        return true;
    }

    async update(attributes: Record<string, any>): Promise<this> {
        if (!this.$exists) return this;
        return this.fill(attributes).save();
    }

    async delete(): Promise<boolean> {
        const C = this.ctor;
        if (!this.$exists) return false;
        if ((await this.fire('deleting')) === false) return false;

        if (C.softDeletes) {
            (this as any).deleted_at = Carbon.now();
            await currentDb().update(C.table).set({ deleted_at: (this as any).deleted_at } as any).where(eqPk(C, this.getKey()));
        } else {
            await currentDb().delete(C.table).where(eqPk(C, this.getKey()));
            this.$exists = false;
        }
        await this.fire('deleted');
        await recordAudit(this, 'deleted');
        return true;
    }

    async forceDelete(): Promise<boolean> {
        const C = this.ctor;
        await currentDb().delete(C.table).where(eqPk(C, this.getKey()));
        this.$exists = false;
        await this.fire('deleted');
        return true;
    }

    async restore(): Promise<boolean> {
        const C = this.ctor;
        (this as any).deleted_at = null;
        await currentDb().update(C.table).set({ deleted_at: null } as any).where(eqPk(C, this.getKey()));
        await this.fire('restored');
        await recordAudit(this, 'restored');
        return true;
    }

    trashed(): boolean {
        return !!(this as any).deleted_at;
    }

    async touch(): Promise<boolean> {
        if (!this.ctor.timestamps || !this.$exists) return false;
        (this as any).updated_at = Carbon.now();
        return (await this.save()) !== null;
    }

    async refresh(): Promise<this> {
        const C = this.ctor;
        const fresh = await (C.query() as Builder<any>).withTrashed().find(this.getKey());
        if (!fresh) throw new ModelNotFoundError(C.name, this.getKey());
        for (const c of C.columnNames()) (this as any)[c] = (fresh as any)[c];
        this.$relations = {};
        this.syncOriginal();
        return this;
    }

    async fresh(...with_: string[]): Promise<this | null> {
        return (this.ctor.query() as Builder<any>).with(...with_).find(this.getKey());
    }

    replicate(except: string[] = []): this {
        const C = this.ctor;
        const copy = new (this.constructor as any)() as this;
        const skip = new Set<string>([C.primaryKey, 'created_at', 'updated_at', ...C.uniqueIds, ...except]);
        for (const c of C.columnNames()) if (!skip.has(c) && (this as any)[c] !== undefined) (copy as any)[c] = cloneValue((this as any)[c]);
        return copy;
    }

    /** `increment()` on a model - issues a single UPDATE, no model events. */
    async increment(column: string, amount = 1, extra: Record<string, any> = {}): Promise<this> {
        const C = this.ctor;
        await (C.query() as Builder<any>).where(C.primaryKey, this.getKey()).increment(column, amount, extra);
        (this as any)[column] = Number((this as any)[column] ?? 0) + amount;
        this.$original[column] = (this as any)[column];
        return this;
    }

    async decrement(column: string, amount = 1, extra: Record<string, any> = {}): Promise<this> {
        return this.increment(column, -amount, extra);
    }

    /* ------------------------------------------------------------------ *
     * Relations
     * ------------------------------------------------------------------ */

    relationDef(name: string): RelationDef | undefined {
        return this.ctor.relations[name];
    }

    /** `$model->relation()` - the query builder bound to this model. */
    relation<T extends Model<any> = any>(name: string): RelationBuilder<T> {
        const def = this.relationDef(name);
        if (!def) throw new Error(`Relation "${name}" is not defined on ${this.ctor.name}`);
        return def.query(this) as RelationBuilder<T>;
    }

    /** `$model->relation` - lazy-load (once) and return the related data. */
    async rel<K extends keyof R & string>(name: K): Promise<R[K]> {
        if (name in this.$relations) return this.$relations[name];
        const def = this.relationDef(name);
        if (!def) throw new Error(`Relation "${name}" is not defined on ${this.ctor.name}`);
        await def.load([this], name);
        return this.$relations[name];
    }

    relationLoaded(name: string): boolean {
        return name in this.$relations;
    }

    setRelation(name: string, value: any): this {
        this.$relations[name] = value;
        return this;
    }

    unsetRelation(name: string): this {
        delete this.$relations[name];
        return this;
    }

    /** `$model->load('a', 'b.c')` */
    async load(...names: string[]): Promise<this> {
        await this.ctor.loadRelations([this], names.flat(), true);
        return this;
    }

    async loadMissing(...names: string[]): Promise<this> {
        await this.ctor.loadRelations([this], names.flat(), false);
        return this;
    }

    static async loadRelations(models: Model<any>[], names: string[], force = true) {
        // group nested paths: 'a.b.c' -> {a: ['b.c']}
        const groups = new Map<string, string[]>();
        for (const n of names) {
            const [head, ...rest] = n.split('.');
            const arr = groups.get(head) ?? [];
            if (rest.length) arr.push(rest.join('.'));
            groups.set(head, arr);
        }
        for (const [name, nested] of groups) {
            const targets = models.filter((m) => force || !(name in m.$relations));
            if (targets.length) {
                const def = targets[0].ctor.relations[name];
                if (!def) throw new Error(`Relation "${name}" is not defined on ${targets[0].ctor.name}`);
                await def.load(targets, name);
            }
            if (nested.length) {
                const children = models.flatMap((m) => {
                    const v = m.$relations[name];
                    return Array.isArray(v) ? v : v ? [v] : [];
                });
                if (children.length) {
                    // children may be of different classes (morphTo)
                    const byClass = new Map<any, Model<any>[]>();
                    for (const c of children) (byClass.get(c.ctor) ?? byClass.set(c.ctor, []).get(c.ctor)!).push(c);
                    for (const [ctor, list] of byClass) await (ctor as typeof Model).loadRelations(list, nested, force);
                }
            }
        }
    }

    /** Many-to-many mutators (`attach`, `detach`, `sync`). */
    async attach(name: string, ids: unknown | unknown[], extra: Record<string, unknown> = {}) {
        const def = this.relationDef(name);
        if (!(def instanceof BelongsToMany)) throw new Error(`Relation "${name}" is not belongsToMany`);
        await def.attach(this, ids, extra);
        this.unsetRelation(name);
    }
    async detach(name: string, ids?: unknown[]) {
        const def = this.relationDef(name);
        if (!(def instanceof BelongsToMany)) throw new Error(`Relation "${name}" is not belongsToMany`);
        await def.detach(this, ids);
        this.unsetRelation(name);
    }
    async sync(name: string, ids: unknown[]) {
        const def = this.relationDef(name);
        if (!(def instanceof BelongsToMany)) throw new Error(`Relation "${name}" is not belongsToMany`);
        await def.sync(this, ids);
        this.unsetRelation(name);
    }

    /* ------------------------------------------------------------------ *
     * Attribute-style access used by templates and serializers
     * ------------------------------------------------------------------ */

    /**
     * Resolve `$model->name`: column → accessor method → relation.
     * Used by the Blade evaluator, which mirrors PHP's property semantics.
     */
    async getAttribute(name: string): Promise<any> {
        const C = this.ctor;
        const mapped = C.accessorMap[name];
        if (mapped && typeof (this as any)[mapped] === 'function') return (this as any)[mapped]();
        if (C.columnNames().includes(name)) return (this as any)[name];
        const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (C.accessors.includes(camel) && typeof (this as any)[camel] === 'function') return (this as any)[camel]();
        if (C.accessors.includes(name) && typeof (this as any)[name] === 'function') return (this as any)[name]();
        if (C.relations[name]) return this.rel(name as any);
        if (C.relations[camel]) return this.rel(camel as any);
        return (this as any)[name];
    }

    /** Array/JSON form following Eloquent's serialization rules. */
    async toArray(): Promise<Record<string, any>> {
        const C = this.ctor;
        const out: Record<string, any> = {};
        const columns = getTableColumns(C.table) as Record<string, MySqlColumn>;
        for (const [name, column] of Object.entries(columns)) {
            if (C.hidden.includes(name)) continue;
            let v = (this as any)[name];
            if (v === undefined) continue;
            const ctype = (column as any).columnType as string;
            const cast = C.casts[name];
            if (v instanceof Carbon) {
                v = isTimestampColumn(name) || cast === 'datetime' || cast === 'date' ? v.toJSON() : v.toDateTimeString();
            } else if (typeof v === 'boolean' && cast !== 'boolean') {
                v = v ? 1 : 0;
            } else if (ctype === 'MySqlDecimal' && v !== null && cast !== 'float') {
                const scale = (column as any).scale ?? 2;
                v = Number(v).toFixed(scale);
            }
            out[name] = v;
        }
        for (const [name, value] of Object.entries(this.$relations)) {
            if (C.hidden.includes(name)) continue;
            out[toSnake(name)] = Array.isArray(value)
                ? await Promise.all(value.map((x: Model<any>) => x.toArray()))
                : value
                  ? await (value as Model<any>).toArray()
                  : value;
        }
        for (const name of C.appends) {
            out[toSnake(name)] = await this.getAttribute(name);
        }
        return out;
    }

    toJSON() {
        return this.getAttributes();
    }
}

function isTimestampColumn(name: string) {
    return name === 'created_at' || name === 'updated_at' || name === 'deleted_at';
}

function toSnake(s: string) {
    return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function eqPk(C: typeof Model, id: unknown): SQL {
    const column = (getTableColumns(C.table) as Record<string, MySqlColumn>)[C.primaryKey];
    return eq(column, id as any);
}

export { Builder, ModelNotFoundError };
export type { CustomAudit };
export { afterCommit };
