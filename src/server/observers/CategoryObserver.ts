import type { Category } from '@/server/models/Category';

async function fullSlug(category: Category): Promise<string> {
    let parent = await category.rel('parent');
    let slug = category.slug;
    // Set full_slug
    while (parent) {
        slug = `${parent.slug}/${slug}`;
        parent = await parent.rel('parent');
    }
    return slug;
}

export const CategoryObserver = {
    async creating(category: Category) {
        // the parent relation must be resolved from the (possibly new) parent_id
        category.unsetRelation('parent');
        category.full_slug = await fullSlug(category);
    },
    async updating(category: Category) {
        // Did parent or slug change?
        if (category.isDirty('parent_id') || category.isDirty('slug')) {
            category.unsetRelation('parent');
            category.full_slug = await fullSlug(category);
            // Update children
            for (const child of await category.rel('children')) {
                await child.update({ full_slug: `${category.full_slug}/${child.slug}` });
            }
        }
    },
};
