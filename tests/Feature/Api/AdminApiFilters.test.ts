import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../../helpers/db';
import { Browser } from '../../helpers/http';
import { createCategory, createProduct, createService, createUser } from '../../helpers/factories';
import { handleAdminApi } from '@/server/api/admin';
import { ApiKey } from '@/server/models/ApiKey';

describe('Admin API: product/category filters and service label', () => {
    useDatabase();
    const token = 'test-token';
    let browser: Browser;

    beforeEach(async () => {
        browser = new Browser();
        await ApiKey.create({
            name: 'test',
            type: 'admin',
            enabled: true,
            token: createHash('sha256').update(token).digest('hex'),
            permissions: ['admin.products.view', 'admin.categories.view', 'admin.services.view'],
        });
    });

    async function get(resource: string, query: string, id: number | null = null) {
        const req = new Request(`http://localhost/api/v1/admin/${resource}${id ? `/${id}` : ''}?${query}`, { headers: { authorization: `Bearer ${token}` } });
        const { value } = await browser.request(async () => handleAdminApi(req as any, resource, id ? String(id) : null));
        const res = value!;
        return { status: res.status, body: (await res.json()) as any };
    }

    it('filters products by slug', async () => {
        const { product } = await createProduct({ slug: 'my-slug' });
        await createProduct({ slug: 'other' });
        const { status, body } = await get('products', 'filter[slug]=my-slug');
        expect(status).toBe(200);
        expect(body.data.map((d: any) => d.id)).toEqual([String(product.id)]);
    });

    it('filters categories by slug and includes products.plans.prices', async () => {
        const cat = await createCategory({ slug: 'cat-a' });
        await createCategory({ slug: 'cat-b' });
        await createProduct({ category_id: cat.id });
        const { status, body } = await get('categories', 'filter[slug]=cat-a&include=products.plans.prices');
        expect(status).toBe(200);
        expect(body.data).toHaveLength(1);
        expect(body.included.map((i: any) => i.type)).toEqual(expect.arrayContaining(['products', 'plans', 'prices']));
    });

    it('exposes the label on services', async () => {
        const user = await createUser();
        const { product } = await createProduct();
        const s = await createService({ user_id: user.id, product_id: product.id, label: 'My server' });
        const { status, body } = await get('services', '', s.id);
        expect(status).toBe(200);
        expect(body.data.attributes.label).toBe('My server');
    });
});
