import { getTableColumns } from 'drizzle-orm';
import { Carbon } from '@/server/lib/carbon';

/**
 * Eloquent returns `decimal` columns as strings (`"21.00"`); the ORM here returns numbers. The admin panel shows the
 * database representation, so decimals are formatted with the scale of their column again.
 */
export function decimalScale(model: any, column: string): number | null {
    const columns = model?.table ? (getTableColumns(model.table) as Record<string, any>) : {};
    const col = columns[column];
    return col && col.columnType === 'MySqlDecimal' ? Number(col.scale ?? 0) : null;
}

/** the value of a column of the record as Eloquent would give it */
export function dbValue(record: any, name: string, value: any): any {
    if (typeof value !== 'number') return value;
    const scale = decimalScale(record?.ctor, name);
    return scale === null ? value : value.toFixed(scale);
}

/** `$record->attributesToArray()` for the admin forms: decimals as strings, dates as `Y-m-d H:i:s` strings */
export function attributesForForm(record: any): Record<string, any> {
    const raw = record.attributesToArray();
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value instanceof Carbon) out[key] = value.toDateTimeString();
        else out[key] = dbValue(record, key, value);
    }
    return out;
}
