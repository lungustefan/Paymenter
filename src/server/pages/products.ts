import { notFound } from 'next/navigation';
import { once } from '@/server/request-store';
import { Category } from '@/server/models/Category';
import type { Product } from '@/server/models/Product';

/** Categories that are shown in the navigation / on the home page (not hidden, with products or sub categories). */
export function visibleRootCategories(): Promise<Category[]> {
    return once('pages:root-categories', () =>
        Category.query()
            .whereNull('parent_id')
            .where((q) => {
                q.whereHas('children').orWhereHas('products', (pq) => {
                    pq.where('hidden', false);
                });
            })
            .orderBy('sort')
            .get(),
    );
}

/** Route model binding: `category:slug` */
export function findCategory(slug: string): Promise<Category> {
    return once(`pages:category:${slug}`, async () => {
        const category = await Category.query().where('slug', slug).first();
        if (!category) notFound();
        return category;
    });
}

export function loadCategoryPage(slug: string) {
    return once(`pages:category-page:${slug}`, async () => {
        const category = await findCategory(slug);
        const products = await category
            .relation<Product>('products')
            .where('hidden', false)
            .with('category', 'plans.prices', 'configOptions.children.plans.prices')
            .orderBy('sort')
            .get();
        const childCategories = await category
            .relation<Category>('children')
            .where((q) => {
                q.whereHas('children').orWhereHas('products', (pq) => {
                    pq.where('hidden', false);
                });
            })
            .orderBy('sort')
            .get();
        const categories = await visibleRootCategories();
        if (products.length === 0 && childCategories.length === 0) notFound();
        return { category, products, childCategories, categories };
    });
}

export function loadProductPage(categorySlug: string, productSlug: string) {
    return once(`pages:product-page:${categorySlug}/${productSlug}`, async () => {
        const category = await findCategory(categorySlug);
        const product = await category
            .relation<Product>('products')
            .where('slug', productSlug)
            .where('hidden', false)
            .with('plans.prices', 'configOptions.children.plans.prices')
            .first();
        if (!product) notFound();
        return { category, product };
    });
}
