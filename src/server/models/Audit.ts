import { Model, morphTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { audits } from '@/server/db/schema';
import type { Row } from './_types';

export interface Audit extends Row<typeof audits> {}

export class Audit extends Model<{ auditable: Model<any> | null; user: Model<any> | null }> {
    static table = audits;
    static morphName = 'OwenIt\\Auditing\\Models\\Audit';
    static guarded: string[] = [];
    static relations: Record<string, RelationDef> = {
        auditable: morphTo('auditable'),
        user: morphTo('user'),
    };

    /** decoded old/new values (stored as JSON text) */
    get oldValues(): Record<string, any> {
        return safeJson(this.old_values);
    }
    get newValues(): Record<string, any> {
        return safeJson(this.new_values);
    }
}

function safeJson(v: string | null): Record<string, any> {
    try {
        return v ? JSON.parse(v) : {};
    } catch {
        return {};
    }
}
