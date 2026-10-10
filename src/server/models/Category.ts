import { Model, belongsTo, hasMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { categories } from '@/server/db/schema';
import type { Row } from './_types';
import { Product } from './Product';
import { CategoryObserver } from '@/server/observers/CategoryObserver';

export interface Category extends Row<typeof categories> {}

export class Category extends Model<{ products: Product[]; parent: Category | null; children: Category[] }> {
    static table = categories;
    static morphName = 'App\\Models\\Category';
    static guarded: string[] = [];
    static auditable = true;
    static auditExclude = ['remember_token'];
    static observers = [CategoryObserver];

    static relations: Record<string, RelationDef> = {
        products: hasMany(() => Product, 'category_id'),
        parent: belongsTo(() => Category, 'parent_id'),
        children: hasMany(() => Category, 'parent_id'),
    };
}
