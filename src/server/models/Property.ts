import { Model, belongsTo, morphTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { properties } from '@/server/db/schema';
import type { Row } from './_types';
import { CustomProperty } from './CustomProperty';
import { PropertyObserver } from '@/server/observers/PropertyObserver';

export interface Property extends Row<typeof properties> {}

export class Property extends Model<{ parent_property: CustomProperty | null; model: Model<any> | null }> {
    static table = properties;
    static morphName = 'App\\Models\\Property';
    static guarded: string[] = [];
    static auditable = true;
    static observers = [PropertyObserver];
    static relations: Record<string, RelationDef> = {
        parent_property: belongsTo(() => CustomProperty, 'custom_property_id'),
        model: morphTo('model'),
    };
}
