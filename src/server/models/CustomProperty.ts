import { Model } from '@/server/orm';
import { customProperties } from '@/server/db/schema';
import type { Row } from './_types';

export interface CustomProperty extends Row<typeof customProperties> {}

export class CustomProperty extends Model {
    static table = customProperties;
    static morphName = 'App\\Models\\CustomProperty';
    static timestamps = false;
    static guarded: string[] = [];
    static auditable = true;
}
