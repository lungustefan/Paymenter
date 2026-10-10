import { randomUUID } from 'node:crypto';
import { Carbon } from '@/server/lib/carbon';
import { replaceSettings, allSettings } from '@/server/config';
import { Category } from '@/server/models/Category';
import { Plan } from '@/server/models/Plan';
import { PriceModel } from '@/server/models/Price';
import { Product } from '@/server/models/Product';
import { Service } from '@/server/models/Service';
import { Invoice } from '@/server/models/Invoice';
import { Ticket } from '@/server/models/Ticket';
import { TicketMessage } from '@/server/models/TicketMessage';
import { User } from '@/server/models/User';
import { hashPassword } from '@/server/lib/crypto';

/** Model factories (database/factories): attributes bypass mass-assignment protection like `Factory::create()`. */
type Ctor<T> = { new (attrs?: Record<string, any>): T };

async function make<T extends { forceFill(a: Record<string, any>): any; save(): Promise<any> }>(C: Ctor<T>, attrs: Record<string, any>): Promise<T> {
    const m = new C();
    m.forceFill(attrs);
    await m.save();
    return m;
}

let sequence = 0;
const next = () => ++sequence;

export const PASSWORD_HASH = hashPassword('password');

export function createUser(attrs: Record<string, any> = {}): Promise<User> {
    const n = next();
    return make(User, {
        first_name: `First${n}`,
        last_name: `Last${n}`,
        email: `user${n}-${randomUUID().slice(0, 8)}@example.com`,
        email_verified_at: Carbon.now(),
        password: PASSWORD_HASH,
        ...attrs,
    });
}

export function createCategory(attrs: Record<string, any> = {}): Promise<Category> {
    const n = next();
    return make(Category, { name: `Category ${n}`, slug: `category-${n}`, ...attrs });
}

/** Port of TestCase::createProduct(): a product with one monthly plan priced 10.00 USD. */
export async function createProduct(attrs: Record<string, any> = {}) {
    const n = next();
    const category = attrs.category_id ? null : await createCategory();
    const product = await make(Product, {
        name: 'Test Product',
        description: 'This is a test product.',
        slug: `test-product-${n}`,
        category_id: category?.id,
        ...attrs,
    });
    const plan = await make(Plan, {
        priceable_id: product.id,
        priceable_type: Product.morphName,
        name: 'Test Plan',
        billing_unit: 'month',
        billing_period: 1,
        type: 'recurring',
    });
    await make(PriceModel, { plan_id: plan.id, price: 10.0, currency_code: 'USD' });
    return { product, plan };
}

export function createService(attrs: Record<string, any> = {}): Promise<Service> {
    return make(Service, { price: 10, currency_code: 'USD', status: 'active', quantity: 1, ...attrs });
}

export function createInvoice(attrs: Record<string, any> = {}): Promise<Invoice> {
    return make(Invoice, { currency_code: 'USD', ...attrs });
}

export function createTicket(attrs: Record<string, any> = {}): Promise<Ticket> {
    return make(Ticket, { subject: 'Subject', status: 'open', priority: 'low', department: 'general', ...attrs });
}

export function createTicketMessage(attrs: Record<string, any> = {}): Promise<TicketMessage> {
    return make(TicketMessage, { message: 'Lorem ipsum', ...attrs });
}

/** `config(['settings.key' => value])`: change the in-memory settings snapshot. */
export function configSettings(values: Record<string, unknown>) {
    replaceSettings({ ...allSettings(), ...values });
}
