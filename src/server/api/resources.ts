import type { ResourceDef } from './jsonapi';

/** Port of app/Http/Resources/* (the JSON:API resources of the admin API). */

const category: ResourceDef = {
    type: 'categories',
    attributes: ['id', 'name', 'parent_id', 'permissions', 'updated_at', 'created_at'],
    relationships: { products: () => product, parent: () => category, children: () => category },
};

const currency: ResourceDef = { type: 'currencies', attributes: ['code', 'name', 'prefix', 'suffix', 'format'] };

const price: ResourceDef = {
    type: 'prices',
    attributes: ['id', 'price', 'setup_fee', 'currency_code'],
    relationships: { currency: () => currency },
};

const plan: ResourceDef = {
    type: 'plans',
    attributes: ['id', 'name', 'type', 'billing_period', 'billing_unit', 'sort'],
    relationships: { prices: () => price },
};

const product: ResourceDef = {
    type: 'products',
    attributes: ['id', 'name', 'description', 'image', 'slug', 'stock', 'per_user_limit', 'sort', 'allow_quantity', 'email_template', 'hidden', 'updated_at', 'created_at'],
    relationships: { category: () => category, plans: () => plan },
};

const property: ResourceDef = { type: 'properties', attributes: ['id', 'name', 'key', 'value', 'updated_at', 'created_at'] };

const role: ResourceDef = { type: 'roles', attributes: ['id', 'name', 'permissions', 'updated_at', 'created_at'] };

const coupon: ResourceDef = {
    type: 'coupons',
    attributes: ['id', 'code', 'type', 'recurring', 'value', 'max_uses', 'max_uses_per_user', 'starts_at', 'expires_at', 'updated_at', 'created_at'],
    relationships: { services: () => service },
};

const user: ResourceDef = {
    type: 'users',
    attributes: ['id', 'first_name', 'last_name', 'email', 'email_verified_at', 'updated_at', 'created_at'],
    relationships: {
        properties: () => property,
        orders: () => order,
        services: () => service,
        invoices: () => invoice,
        tickets: () => ticket,
        credits: () => credit,
        role: () => role,
    },
    meta(model) {
        // Is properties loaded?
        const props = (model as any).$relations?.properties as any[] | undefined;
        if (!props) return {};
        return { properties: Object.fromEntries(props.map((p) => [p.key, p.value])) };
    },
};

const credit: ResourceDef = {
    type: 'credits',
    attributes: ['id', 'currency_code', 'amount', 'updated_at', 'created_at'],
    relationships: { user: () => user },
};

const order: ResourceDef = {
    type: 'orders',
    attributes: ['id', 'currency_code', 'user_id', 'updated_at', 'created_at'],
    relationships: { services: () => service, user: () => user },
};

const service: ResourceDef = {
    type: 'services',
    attributes: ['id', 'quantity', 'price', 'status', 'currency_code', 'expires_at', 'updated_at', 'created_at', 'label'],
    relationships: {
        coupon: () => coupon,
        user: () => user,
        order: () => order,
        product: () => product,
        invoices: () => invoice,
        properties: () => property,
    },
};

const serviceUpgrade: ResourceDef = {
    type: 'serviceUpgrades',
    attributes: ['id', 'status', 'service_id', 'plan_id', 'product_id', 'updated_at', 'created_at'],
    relationships: { service: () => property, invoice: () => invoice },
};

const invoice: ResourceDef = {
    type: 'invoices',
    attributes: ['id', 'status', 'currency_code', 'due_at', 'updated_at', 'created_at'],
    relationships: { user: () => user, items: () => invoiceItem },
};

const invoiceItem: ResourceDef = {
    type: 'invoiceItems',
    attributes: ['id', 'description', 'quantity', 'price', 'reference_type', 'reference_id', 'updated_at', 'created_at'],
    relationships: { reference: () => service, invoice: () => invoice },
    resolve: {
        // the reference resource depends on the type of the referenced model
        reference(model) {
            const value = (model as any).$relations?.reference;
            if (value === undefined) return null;
            const type = (model as any).reference_type;
            const def = type === 'App\\Models\\Credit' ? credit : type === 'App\\Models\\ServiceUpgrade' ? serviceUpgrade : service;
            return { def, value };
        },
    },
};

const ticketAttachment: ResourceDef = {
    type: 'ticketMessageAttachments',
    attributes: ['id', 'uuid', 'filename', 'path', 'filesize', 'mime_type', 'created_at', 'updated_at'],
    relationships: { message: () => ticketMessage },
};

const ticketMessage: ResourceDef = {
    type: 'ticketMessages',
    attributes: ['id', 'message', 'updated_at', 'created_at'],
    relationships: { user: () => user, ticket: () => ticket, attachments: () => ticketAttachment },
};

const ticket: ResourceDef = {
    type: 'tickets',
    attributes: ['id', 'subject', 'status', 'priority', 'assigned_to', 'user_id', 'department', 'updated_at', 'created_at'],
    relationships: { messages: () => ticketMessage, user: () => user, assigned_to: () => user },
};

export const resources = { category, product, user, credit, order, service, invoice, invoiceItem, ticket, ticketMessage, role, plan, price, property, coupon, currency, serviceUpgrade, ticketAttachment };
