import type { Model } from '@/server/orm';

/**
 * A small port of timacdonald/json-api (the JSON:API resources the Paymenter API returns):
 * `{ id, type, attributes, relationships?, meta? }` plus `included` for `?include=`.
 */
export interface ResourceDef {
    type: string;
    attributes: string[];
    /** JSON key => resource definition (lazy: resources reference each other) */
    relationships?: Record<string, () => ResourceDef>;
    /** relationship overrides that cannot be derived from the model relation of the same name */
    resolve?: Record<string, (model: Model<any>) => { def: ResourceDef; value: any } | null>;
    meta?: (model: Model<any>) => Record<string, any>;
}

export interface ResourceObject {
    id: string;
    type: string;
    attributes?: Record<string, any>;
    relationships?: Record<string, { data: any }>;
    meta?: Record<string, any>;
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** `?include=a,b.c` -> children of `prefix` ('' = root, 'plans.' = under plans) */
function includesFor(includes: string[], prefix: string): string[] {
    const out: string[] = [];
    for (const inc of includes) {
        if (!inc.startsWith(prefix)) continue;
        const name = inc.slice(prefix.length).split('.')[0];
        if (name && !out.includes(name)) out.push(name);
    }
    return out;
}

export interface SerializeContext {
    includes: string[];
    fields: Record<string, string[]>;
}

const identifier = (def: ResourceDef, model: Model<any>) => ({ type: def.type, id: String(model.getKey()) });

interface Related {
    name: string;
    def: ResourceDef;
    /** null (to-one without a value) or the related model(s) */
    value: Model<any> | Model<any>[] | null;
    prefix: string;
}

/** The requested relationships (`?include=`) of a resource, in the order the resource declares them. */
function requestedRelationships(model: Model<any>, def: ResourceDef, ctx: SerializeContext, prefix: string): Related[] {
    const requested = includesFor(ctx.includes, prefix);
    const out: Related[] = [];
    for (const [name, defFn] of Object.entries(def.relationships ?? {})) {
        if (!requested.includes(name)) continue;
        const resolved = def.resolve?.[name]?.(model);
        const value = resolved ? resolved.value : (model as any).$relations?.[camel(name)];
        if (value === undefined) continue;
        out.push({ name, def: resolved ? resolved.def : defFn(), value, prefix: `${prefix}${name}.` });
    }
    return out;
}

/** Serialise a model (attributes, relationship identifiers, meta). */
export function toResource(model: Model<any>, def: ResourceDef, ctx: SerializeContext, prefix = ''): ResourceObject {
    const all = model.attributesToArray();
    const wanted = ctx.fields[def.type];
    const attributes: Record<string, any> = {};
    for (const key of def.attributes) {
        if (wanted && !wanted.includes(key)) continue;
        const value = key in all ? all[key] : (model as any)[key];
        attributes[key] = value === undefined ? null : value;
    }

    const out: ResourceObject = { id: String(model.getKey()), type: def.type, attributes };

    const relationships: Record<string, { data: any }> = {};
    for (const rel of requestedRelationships(model, def, ctx, prefix)) {
        relationships[rel.name] = {
            data: Array.isArray(rel.value) ? rel.value.map((m) => identifier(rel.def, m)) : rel.value === null ? null : identifier(rel.def, rel.value),
        };
    }
    if (Object.keys(relationships).length) out.relationships = relationships;

    const meta = def.meta?.(model);
    if (meta && Object.keys(meta).length) out.meta = meta;
    return out;
}

/** `included` of one resource: its direct relationships first, then what those include (recursively). */
export function includedOf(model: Model<any>, def: ResourceDef, ctx: SerializeContext, prefix = ''): ResourceObject[] {
    const rels = requestedRelationships(model, def, ctx, prefix);
    const items: { model: Model<any>; def: ResourceDef; prefix: string }[] = [];
    for (const rel of rels) {
        if (rel.value === null) continue;
        for (const m of Array.isArray(rel.value) ? rel.value : [rel.value]) items.push({ model: m, def: rel.def, prefix: rel.prefix });
    }
    const direct = items.map((i) => toResource(i.model, i.def, ctx, i.prefix));
    const nested = items.flatMap((i) => includedOf(i.model, i.def, ctx, i.prefix));
    return [...direct, ...nested];
}

export function uniqueResources(list: ResourceObject[]): ResourceObject[] {
    const seen = new Set<string>();
    return list.filter((r) => {
        const key = `${r.type}:${r.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Parse `fields[type]=a,b` */
export function parseFields(params: URLSearchParams): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [k, v] of params.entries()) {
        const m = /^fields\[(.+)\]$/.exec(k);
        if (m) out[m[1]] = v.split(',').filter(Boolean);
    }
    return out;
}
