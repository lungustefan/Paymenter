import { sql } from 'drizzle-orm';
import { currentDb } from './context';

/** Tiny raw-query helpers used by the validator (`exists:` / `unique:` rules). */
export const query = {
    /** number of distinct `column` values in `table` that are in `values` */
    async count(table: string, column: string, values: unknown[]): Promise<number> {
        if (!values.length) return 0;
        const list = sql.join(values.map((v) => sql`${v}`), sql`, `);
        const [rows] = (await currentDb().execute(
            sql`select count(distinct ${sql.identifier(column)}) as c from ${sql.identifier(table)} where ${sql.identifier(column)} in (${list})`,
        )) as any;
        return Number(rows?.[0]?.c ?? 0);
    },

    /** is there a row whose `column` equals `value` (optionally ignoring one row / adding conditions)? */
    async exists(
        table: string,
        column: string,
        value: unknown,
        ignore?: { column: string; value: unknown },
        where: Array<[string, unknown]> = [],
    ): Promise<boolean> {
        const parts = [sql`${sql.identifier(column)} = ${value}`];
        if (ignore) parts.push(sql`${sql.identifier(ignore.column)} <> ${ignore.value}`);
        for (const [c, v] of where) parts.push(v === 'NULL' ? sql`${sql.identifier(c)} is null` : sql`${sql.identifier(c)} = ${v}`);
        const [rows] = (await currentDb().execute(
            sql`select 1 as x from ${sql.identifier(table)} where ${sql.join(parts, sql` and `)} limit 1`,
        )) as any;
        return (rows?.length ?? 0) > 0;
    },
};
