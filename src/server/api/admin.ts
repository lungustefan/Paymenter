import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { boot } from '@/server/bootstrap';
import { ensureSettings } from '@/server/settings/store';
import { setting } from '@/server/config';
import { Carbon } from '@/server/lib/carbon';
import { ApiKey } from '@/server/models/ApiKey';
import { Category } from '@/server/models/Category';
import { Credit } from '@/server/models/Credit';
import { Invoice } from '@/server/models/Invoice';
import { InvoiceItem } from '@/server/models/InvoiceItem';
import { Order } from '@/server/models/Order';
import { Plan } from '@/server/models/Plan';
import { Product } from '@/server/models/Product';
import { Service } from '@/server/models/Service';
import { Ticket } from '@/server/models/Ticket';
import { TicketMessage } from '@/server/models/TicketMessage';
import { User } from '@/server/models/User';
import { resolveMorph, type Builder, type Model } from '@/server/orm';
import { validate, ValidationError, type Rules } from '@/server/validation';
import { includedOf, parseFields, toResource, uniqueResources, type ResourceDef, type SerializeContext } from './jsonapi';
import { resources } from './resources';

/** Port of the `api.admin` middleware, the FormRequests and the controllers of /api/v1/admin/*. */

export class ApiError extends Error {
    constructor(public status: number, message: string, public body?: Record<string, unknown>) {
        super(message);
    }
}

const MAPPED_INCLUDES: Record<string, string> = {
    assigned_to: 'users',
    category: 'categories',
    children: 'categories',
    coupon: 'coupons',
    invoice: 'invoices',
    items: 'invoice_items',
    messages: 'ticket_messages',
    attachments: 'ticket_messages',
    order: 'orders',
    parent: 'categories',
    product: 'products',
    'products.plans.prices': 'products',
    role: 'roles',
    user: 'users',
    ticket: 'tickets',
    'plans.prices': 'products',
};

interface Endpoint {
    slug: string;
    model: any;
    def: ResourceDef;
    permission: string;
    includes: string[];
    filters: string[];
    sorts: string[];
    actions: Array<'index' | 'show' | 'store' | 'update' | 'destroy'>;
    defaults?: Record<string, any>;
    createRules?: (input: Record<string, any>) => Rules;
    updateRules?: (record: Model<any>, input: Record<string, any>) => Rules;
    /** extra permission checks (`authorize()` overrides) */
    authorize?: (input: Record<string, any>, has: (p: string) => boolean) => boolean;
}

const planBelongsToProduct = (input: Record<string, any>) => async (value: any, fail: (m: string) => void) => {
    const productId = input.product_id;
    if (productId && !(await Plan.query().where('id', value).where('priceable_type', 'App\\Models\\Product').where('priceable_id', productId).exists())) {
        fail('The selected plan does not belong to the specified product.');
    }
};

const referenceRule = (input: Record<string, any>) => async (value: any, fail: (m: string) => void) => {
    if (input.reference_type && !value) fail('The reference_id field is required when reference_type is provided.');
    if (input.reference_type && value) {
        const Cls = resolveMorph(String(input.reference_type));
        if (!Cls) fail('The reference_type must be a valid class name.');
        else if (!(await (Cls as any).query().where('id', value).exists())) fail('The selected reference_id is invalid for the given reference_type.');
    }
};

const departments = () => Object.values((setting<any>('ticket_departments', []) ?? {}) as Record<string, string>).join(',');

const endpoints: Endpoint[] = [
    {
        slug: 'categories',
        model: Category,
        def: resources.category,
        permission: 'categories',
        includes: ['products', 'parent', 'children'],
        filters: ['name', 'parent_id'],
        sorts: ['id', 'created_at', 'updated_at', 'name'],
        actions: ['index', 'show'],
    },
    {
        slug: 'credits',
        model: Credit,
        def: resources.credit,
        permission: 'credits',
        includes: ['user'],
        filters: ['id', 'currency_code', 'user_id'],
        sorts: ['id', 'created_at', 'updated_at', 'currency_code'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        createRules: (i) => ({
            user_id: 'required|exists:users,id',
            currency_code: ['required', 'string', 'exists:currencies,code', `unique:credits,currency_code,NULL,id,user_id,${i.user_id}`],
            amount: 'required|numeric|min:0',
        }),
        updateRules: (r) => ({
            currency_code: ['sometimes', 'required', 'string', 'exists:currencies,code', `unique:credits,currency_code,${r.getKey()},id,user_id,${(r as any).user_id}`],
            amount: 'sometimes|required|numeric|min:0',
        }),
    },
    {
        slug: 'users',
        model: User,
        def: resources.user,
        permission: 'users',
        includes: ['properties', 'orders', 'services', 'invoices', 'tickets', 'credits', 'role'],
        filters: ['first_name', 'last_name', 'email'],
        sorts: ['id', 'first_name', 'last_name', 'email', 'created_at'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        authorize: (i, has) => !('role_id' in i) || has('admin.roles.update'),
        createRules: () => ({
            first_name: 'nullable|string|max:255',
            last_name: 'nullable|string|max:255',
            email: 'required|email|max:255|unique:users,email',
            password: 'required|string|min:8',
            email_verified_at: 'nullable|date',
            role_id: 'nullable|exists:roles,id',
        }),
        updateRules: (r) => ({
            first_name: 'sometimes|nullable|string|max:255',
            last_name: 'sometimes|nullable|string|max:255',
            email: `sometimes|required|email|max:255|unique:users,email,${r.getKey()}`,
            password: 'sometimes|string|min:8',
            email_verified_at: 'sometimes|nullable|date',
            role_id: 'sometimes|nullable|exists:roles,id',
        }),
    },
    {
        slug: 'products',
        model: Product,
        def: resources.product,
        permission: 'products',
        includes: ['category', 'plans.prices', 'services'],
        filters: ['name', 'category_id', 'server_id', 'hidden', 'allow_quantity'],
        sorts: ['id', 'created_at', 'updated_at', 'name', 'sort', 'stock'],
        actions: ['index', 'show'],
    },
    {
        slug: 'services',
        model: Service,
        def: resources.service,
        permission: 'services',
        includes: ['order', 'coupon', 'user', 'product', 'invoices', 'properties'],
        filters: ['quantity', 'price', 'expires_at', 'subscription_id', 'status'],
        sorts: ['id', 'created_at', 'updated_at', 'expires_at', 'status'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        defaults: { quantity: 1, status: 'pending' },
        createRules: (i) => ({
            product_id: 'required|exists:products,id',
            plan_id: ['required', 'exists:plans,id', planBelongsToProduct(i)],
            user_id: 'required|exists:users,id',
            quantity: 'required|integer|min:1',
            status: 'required|in:pending,active,cancelled,suspended',
            expires_at: 'nullable|date|after_or_equal:today',
            currency_code: 'required|string|exists:currencies,code',
            price: 'required|numeric|min:0',
            coupon_id: 'nullable|exists:coupons,id',
            subscription_id: 'nullable|string|max:255',
            order_id: 'nullable|exists:orders,id',
        }),
        updateRules: (_r, i) => ({
            product_id: 'sometimes|required|exists:products,id',
            plan_id: ['sometimes', 'required', 'exists:plans,id', planBelongsToProduct(i)],
            user_id: 'sometimes|required|exists:users,id',
            quantity: 'sometimes|required|integer|min:1',
            status: 'sometimes|required|in:pending,active,cancelled,suspended',
            expires_at: 'sometimes|nullable|date|after_or_equal:today',
            currency_code: 'sometimes|required|string|exists:currencies,code',
            price: 'sometimes|required|numeric|min:0',
            coupon_id: 'sometimes|nullable|exists:coupons,id',
            subscription_id: 'sometimes|nullable|string|max:255',
            order_id: 'sometimes|nullable|exists:orders,id',
        }),
    },
    {
        slug: 'orders',
        model: Order,
        def: resources.order,
        permission: 'orders',
        includes: ['services', 'user'],
        filters: ['id', 'currency_code'],
        sorts: ['id', 'created_at', 'updated_at', 'currency_code'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        createRules: () => ({ user_id: 'required|exists:users,id', currency_code: 'required|string|exists:currencies,code' }),
        updateRules: () => ({ user_id: 'sometimes|required|exists:users,id', currency_code: 'sometimes|required|string|exists:currencies,code' }),
    },
    {
        slug: 'invoices',
        model: Invoice,
        def: resources.invoice,
        permission: 'invoices',
        includes: ['items', 'user'],
        filters: ['id', 'currency_code', 'user_id', 'status'],
        sorts: ['id', 'created_at', 'updated_at', 'currency_code'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        defaults: { status: 'pending' },
        createRules: () => ({
            user_id: 'required|exists:users,id',
            currency_code: 'required|string|exists:currencies,code',
            due_at: 'nullable|date',
            status: 'required|string|in:pending,paid,cancelled',
        }),
        updateRules: () => ({
            user_id: 'sometimes|required|exists:users,id',
            currency_code: 'sometimes|required|string|exists:currencies,code',
            due_at: 'sometimes|nullable|date',
            status: 'sometimes|required|string|in:pending,paid,cancelled',
        }),
    },
    {
        slug: 'invoice-items',
        model: InvoiceItem,
        def: resources.invoiceItem,
        permission: 'invoice_items',
        includes: ['invoice'],
        filters: ['id', 'quantity', 'price', 'reference_type', 'reference_id'],
        sorts: ['id', 'created_at', 'updated_at', 'quantity', 'price'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        defaults: { status: 'pending' },
        createRules: (i) => ({
            invoice_id: 'required|exists:invoices,id',
            description: 'required|string|max:255',
            price: 'required|numeric|min:0',
            quantity: 'required|integer|min:1',
            reference_type: 'nullable|string|max:255',
            reference_id: ['nullable', 'integer', referenceRule(i)],
        }),
        updateRules: (_r, i) => ({
            description: 'sometimes|string|max:255',
            quantity: 'sometimes|integer|min:1',
            price: 'sometimes|numeric|min:0',
            reference_type: 'sometimes|string|max:100',
            reference_id: ['sometimes', 'integer', referenceRule(i)],
        }),
    },
    {
        slug: 'tickets',
        model: Ticket,
        def: resources.ticket,
        permission: 'tickets',
        includes: ['messages', 'user', 'assigned_to'],
        filters: ['id', 'currency_code', 'user_id', 'status', 'priority', 'department'],
        sorts: ['id', 'created_at', 'updated_at', 'currency_code', 'status', 'priority', 'department'],
        actions: ['index', 'show', 'store', 'update', 'destroy'],
        defaults: { priority: 'medium', status: 'open' },
        createRules: () => ({
            subject: 'required|string|max:255',
            user_id: 'required|exists:users,id',
            department: `nullable|string|in:${departments()}`,
            priority: 'required|string|in:low,medium,high',
            status: 'required|string|in:open,closed,replied',
        }),
        updateRules: () => ({
            subject: 'sometimes|required|string|max:255',
            user_id: 'sometimes|required|exists:users,id',
            department: `sometimes|nullable|string|in:${departments()}`,
            priority: 'sometimes|required|string|in:low,medium,high',
            status: 'sometimes|required|string|in:open,closed,replied',
        }),
    },
    {
        slug: 'ticket-messages',
        model: TicketMessage,
        def: resources.ticketMessage,
        permission: 'ticket_messages',
        includes: ['user', 'ticket', 'attachments'],
        filters: ['id', 'currency_code'],
        sorts: ['id', 'created_at', 'updated_at', 'currency_code'],
        actions: ['index', 'show', 'store', 'destroy'],
        createRules: () => ({ message: 'required|string|max:5000', user_id: 'required|exists:users,id', ticket_id: 'required|exists:tickets,id' }),
    },
];

export const findEndpoint = (slug: string) => endpoints.find((e) => e.slug === slug);

/* ------------------------------ authentication ------------------------------ */

export function clientIp(request: Request): string | null {
    const fwd = request.headers.get('x-forwarded-for');
    return fwd ? fwd.split(',')[0].trim() : (request.headers.get('x-real-ip') ?? null);
}

/** `api.admin` middleware */
export async function authenticateAdminApi(request: Request): Promise<{ key: ApiKey; permissions: string[] }> {
    const header = request.headers.get('authorization') ?? '';
    const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    if (!bearer) throw new ApiError(401, 'The request is missing a valid bearer token.', { error: 'The request is missing a valid bearer token.' });

    const key = await ApiKey.query().where('token', createHash('sha256').update(bearer).digest('hex')).where('enabled', true).first();
    if (!key) throw new ApiError(401, 'The provided API key is invalid or has been disabled.');

    const ips = (key.ip_addresses as string[] | null) ?? null;
    if (key.type !== 'admin' || (ips && ips.length > 0 && !ips.includes(clientIp(request) ?? ''))) throw new ApiError(403, 'You do not have permission to access this resource.');

    key.last_used_at = Carbon.now();
    await key.saveQuietly();
    return { key, permissions: ((key.permissions as string[] | null) ?? []) as string[] };
}

/* ------------------------------ spatie/laravel-query-builder ------------------------------ */

function allowedIncludes(includes: string[], permissions: string[]): string[] {
    return includes.filter((inc) => permissions.includes(`admin.${MAPPED_INCLUDES[inc] ?? inc}.view`));
}

function expandIncludes(allowed: string[]): string[] {
    // `plans.prices` also allows `plans`
    const out = new Set<string>();
    for (const inc of allowed) {
        const parts = inc.split('.');
        for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('.'));
    }
    return [...out];
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

function allowedList(names: string[]): string {
    return names.join(', ');
}

function applyQuery(builder: Builder<any, any>, endpoint: Endpoint, params: URLSearchParams, permissions: string[]): { includes: string[] } {
    // filters
    const filters: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
        const m = /^filter\[(.+)\]$/.exec(k);
        if (m) filters[m[1]] = v;
    }
    const unknown = Object.keys(filters).filter((f) => !endpoint.filters.includes(f));
    if (unknown.length) throw new ApiError(400, `Requested filter(s) \`${unknown.join(', ')}\` are not allowed. Allowed filter(s) are \`${allowedList(endpoint.filters)}\`.`);
    for (const [name, raw] of Object.entries(filters)) {
        // partial filter (`LOWER(col) LIKE %value%`), comma separated values are OR'ed
        const values = raw.split(',').map((v) => (v === 'true' ? '1' : v === 'false' ? '0' : v));
        builder.where((q: any) => {
            for (const value of values) q.orWhereRaw(rawLike(endpoint.model, name, value));
        });
    }

    // includes
    const allowed = expandIncludes(allowedIncludes(endpoint.includes, permissions));
    const requested = (params.get('include') ?? '').split(',').filter(Boolean);
    const bad = requested.filter((r) => !allowed.includes(r));
    if (bad.length) {
        const list = allowed.flatMap((a) => [a, `${a}Count`, `${a}Exists`]);
        throw new ApiError(400, `Requested include(s) \`${bad.join(', ')}\` are not allowed. Allowed include(s) are \`${allowedList(list)}\`.`);
    }
    if (requested.length) builder.with(...requested.map((r) => r.split('.').map(camel).join('.')));

    // sorts
    const sorts = (params.get('sort') ?? '').split(',').filter(Boolean);
    const badSorts = sorts.filter((s) => !endpoint.sorts.includes(s.replace(/^-/, '')));
    if (badSorts.length) throw new ApiError(400, `Requested sort(s) \`${badSorts.map((s) => s.replace(/^-/, '')).join(', ')}\` is not allowed. Allowed sort(s) are \`${allowedList(endpoint.sorts)}\`.`);
    for (const s of sorts) builder.orderBy(s.replace(/^-/, ''), s.startsWith('-') ? 'desc' : 'asc');

    return { includes: requested };
}

function rawLike(model: any, column: string, value: string) {
    const col = (model.table as any)[column];
    return sql`LOWER(${col}) LIKE ${`%${value.toLowerCase()}%`}`;
}

/* ------------------------------ request handling ------------------------------ */

async function bodyOf(request: Request): Promise<Record<string, any>> {
    const type = request.headers.get('content-type') ?? '';
    try {
        if (type.includes('application/json')) return (await request.json()) ?? {};
        if (type.includes('form')) {
            const fd = await request.formData();
            const out: Record<string, any> = {};
            fd.forEach((v, k) => (out[k] = v));
            return out;
        }
    } catch {
        /* empty body */
    }
    return {};
}

function jsonApi(body: unknown, status = 200): NextResponse {
    return new NextResponse(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/vnd.api+json' } });
}

export function errorResponse(e: unknown): NextResponse {
    if (e instanceof ApiError) return NextResponse.json(e.body ?? { message: e.message }, { status: e.status });
    if (e instanceof ValidationError) {
        const all = Object.values(e.errors).flat();
        const extra = all.length - 1;
        const message = all[0] + (extra > 0 ? ` (and ${extra} more error${extra > 1 ? 's' : ''})` : '');
        return NextResponse.json({ message, errors: e.errors }, { status: 422 });
    }
    console.error('[api]', e);
    return NextResponse.json({ message: 'Server Error' }, { status: 500 });
}

async function find(endpoint: Endpoint, id: string): Promise<Model<any>> {
    const record = /^\d+$/.test(id) ? await endpoint.model.find(Number(id)) : null;
    if (!record) throw new ApiError(404, `No query results for model [${endpoint.model.morphName}] ${id}`);
    return record;
}

const url = (request: Request) => new URL(request.url);

function pageUrl(base: string, page: number) {
    return `${base}?page=${page}`;
}

/** Entry point for `/api/v1/admin/{resource}[/{id}]` */
export async function handleAdminApi(request: Request, slug: string, id: string | null): Promise<NextResponse> {
    try {
        await boot();
        await ensureSettings();
        const endpoint = findEndpoint(slug);
        if (!endpoint) return NextResponse.json({ message: 'Not Found' }, { status: 404 });

        const { permissions } = await authenticateAdminApi(request);
        const has = (p: string) => permissions.includes(p);
        const method = request.method.toUpperCase();
        const u = url(request);
        const action = id === null ? (method === 'GET' ? 'index' : method === 'POST' ? 'store' : null) : method === 'GET' ? 'show' : method === 'PUT' || method === 'PATCH' ? 'update' : method === 'DELETE' ? 'destroy' : null;
        if (!action || !endpoint.actions.includes(action)) return NextResponse.json({ message: 'The route could not be found.' }, { status: 405 });

        const perm = { index: 'view', show: 'view', store: 'create', update: 'update', destroy: 'delete' }[action];
        const forbid = () => new ApiError(403, 'This action is unauthorized.');
        if (!has(`admin.${endpoint.permission}.${perm}`)) throw forbid();

        const fields = parseFields(u.searchParams);

        if (action === 'index') {
            const builder = endpoint.model.query() as Builder<any, any>;
            const { includes } = applyQuery(builder, endpoint, u.searchParams, permissions);
            const perPageRaw = u.searchParams.get('per_page');
            const perPage = Math.max(1, Number(perPageRaw ?? 15) || 15);
            const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
            const result = await builder.simplePaginate(perPage, page);

            const ctx: SerializeContext = { includes, fields };
            const data = result.data.map((m: Model<any>) => toResource(m, endpoint.def, ctx));
            const included = uniqueResources(result.data.flatMap((m: Model<any>) => includedOf(m, endpoint.def, ctx)));

            const base = `${u.origin}${u.pathname}`;
            const links: Record<string, string> = { first: pageUrl(base, 1) };
            if (page > 1) links.prev = pageUrl(base, page - 1);
            if (result.has_more_pages) links.next = pageUrl(base, page + 1);
            const from = result.data.length ? (page - 1) * perPage + 1 : null;
            return jsonApi({
                data,
                links,
                meta: { current_page: page, current_page_url: pageUrl(base, page), from, path: base, per_page: perPageRaw ?? 15, to: from === null ? null : from + result.data.length - 1 },
                ...(included.length ? { included } : {}),
            });
        }

        if (action === 'show') {
            const record = await find(endpoint, id!);
            const builder = endpoint.model.query() as Builder<any, any>;
            const { includes } = applyQuery(builder, { ...endpoint, filters: [], sorts: [] }, u.searchParams, permissions);
            const loaded = await builder.findOrFail(record.getKey());
            return respondOne(endpoint, loaded, includes, fields);
        }

        if (action === 'destroy') {
            const record = await find(endpoint, id!);
            await record.delete();
            return new NextResponse(null, { status: 204 });
        }

        // store / update
        const input = { ...(await bodyOf(request)) };
        if (endpoint.authorize && !endpoint.authorize(input, has)) throw forbid();
        if (action === 'store') for (const [k, v] of Object.entries(endpoint.defaults ?? {})) if (!(k in input)) input[k] = v;

        let record: Model<any> | null = null;
        let rules: Rules;
        if (action === 'update') {
            record = await find(endpoint, id!);
            rules = endpoint.updateRules!(record, input);
        } else rules = endpoint.createRules!(input);

        const validated = await validate(input, rules);
        const saved = action === 'store' ? await endpoint.model.create(validated) : await record!.update(validated);

        // `loadAllowedIncludes`: only the allowed relations of `?include=` are loaded
        const builder = endpoint.model.query() as Builder<any, any>;
        const { includes } = applyQuery(builder, { ...endpoint, filters: [], sorts: [] }, u.searchParams, permissions);
        const loaded = await builder.findOrFail(saved.getKey());
        return respondOne(endpoint, loaded, includes, fields);
    } catch (e) {
        return errorResponse(e);
    }
}

function respondOne(endpoint: Endpoint, model: Model<any>, includes: string[], fields: Record<string, string[]>) {
    const ctx: SerializeContext = { includes, fields };
    const data = toResource(model, endpoint.def, ctx);
    const included = uniqueResources(includedOf(model, endpoint.def, ctx));
    return jsonApi({ data, ...(included.length ? { included } : {}) });
}

/** `HandleCors` for api/*: any origin, any method. */
export function withCors(res: NextResponse, request?: Request): NextResponse {
    res.headers.set('Access-Control-Allow-Origin', '*');
    const requested = request?.headers.get('access-control-request-headers');
    if (request?.method === 'OPTIONS') {
        res.headers.set('Access-Control-Allow-Methods', '*');
        if (requested) res.headers.set('Access-Control-Allow-Headers', requested);
    }
    return res;
}
