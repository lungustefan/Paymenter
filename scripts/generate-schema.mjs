#!/usr/bin/env node
/**
 * Regenerates src/server/db/schema.ts from a database that has had every
 * migration in ./migrations applied (see `pnpm migrate`).
 *
 *   DB_DATABASE=paymenter node scripts/generate-schema.mjs > src/server/db/schema.ts
 *
 * Property names intentionally stay snake_case so they are 1:1 with the
 * original Eloquent attributes and the JSON API output.
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? 'paymenter',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'paymenter',
});
const db = process.env.DB_DATABASE ?? 'paymenter';

const [cols] = await conn.query(
    `select table_name t, column_name c, data_type dt, column_type ct, is_nullable n, column_default d, extra e, column_key k,
            character_maximum_length len, numeric_precision p, numeric_scale s
       from information_schema.columns where table_schema = ? order by table_name, ordinal_position`,
    [db],
);
const [checks] = await conn.query(
    `select table_name t, constraint_name c, check_clause cl from information_schema.check_constraints
      where constraint_schema = ? and check_clause like 'json_valid%'`,
    [db],
);
const jsonCols = new Set(checks.map((r) => `${r.t}.${r.c}`));

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const tables = new Map();
for (const r of cols) {
    if (r.t === 'migrations') continue;
    if (!tables.has(r.t)) tables.set(r.t, []);
    tables.get(r.t).push(r);
}

const used = new Set();
const lines = [];

function colExpr(r) {
    const name = JSON.stringify(r.c);
    let expr;
    const unsigned = /unsigned/.test(r.ct);
    const isJson = r.dt === 'json' || jsonCols.has(`${r.t}.${r.c}`);
    if (isJson) {
        used.add('dbJson');
        expr = `dbJson(${name})`;
    } else if (r.dt === 'tinyint' && /^tinyint\(1\)/.test(r.ct)) {
        used.add('boolean');
        expr = `boolean(${name})`;
    } else if (r.dt === 'bigint') {
        used.add('bigint');
        expr = `bigint(${name}, { mode: 'number'${unsigned ? ', unsigned: true' : ''} })`;
    } else if (['int', 'tinyint', 'smallint', 'mediumint'].includes(r.dt)) {
        const fn = r.dt === 'int' ? 'int' : r.dt;
        used.add(fn);
        expr = `${fn}(${name}${unsigned ? ', { unsigned: true }' : ''})`;
    } else if (r.dt === 'varchar') {
        used.add('varchar');
        expr = `varchar(${name}, { length: ${r.len} })`;
    } else if (r.dt === 'char') {
        used.add('char');
        expr = `char(${name}, { length: ${r.len} })`;
    } else if (r.dt === 'uuid') {
        used.add('char');
        expr = `char(${name}, { length: 36 })`;
    } else if (['text', 'mediumtext', 'longtext'].includes(r.dt)) {
        used.add(r.dt);
        expr = `${r.dt}(${name})`;
    } else if (r.dt === 'decimal') {
        used.add('decimal');
        expr = `decimal(${name}, { precision: ${r.p}, scale: ${r.s}, mode: 'number' })`;
    } else if (r.dt === 'enum') {
        used.add('mysqlEnum');
        const vals = [...r.ct.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
        expr = `mysqlEnum(${name}, ${JSON.stringify(vals)})`;
    } else if (r.dt === 'timestamp') {
        used.add('dbTimestamp');
        expr = `dbTimestamp(${name})`;
    } else if (r.dt === 'datetime') {
        used.add('dbDatetime');
        expr = `dbDatetime(${name})`;
    } else if (r.dt === 'date') {
        used.add('dbDate');
        expr = `dbDate(${name})`;
    } else {
        throw new Error(`Unhandled type ${r.dt} for ${r.t}.${r.c}`);
    }

    const pk = r.k === 'PRI';
    const auto = /auto_increment/i.test(r.e);
    if (pk) expr += '.primaryKey()';
    if (auto) expr += '.autoincrement()';
    if (r.n === 'NO' && !pk) expr += '.notNull()';

    if (!auto && r.d !== null && r.d !== undefined && String(r.d).toUpperCase() !== 'NULL') {
        let d = String(r.d);
        if (/^current_timestamp/i.test(d)) {
            used.add('sql');
            expr += '.default(sql`CURRENT_TIMESTAMP`)';
        } else if (r.dt === 'tinyint' && /^tinyint\(1\)/.test(r.ct)) {
            expr += `.default(${d === '1' || d === "'1'"})`;
        } else if (['int', 'bigint', 'tinyint', 'smallint', 'decimal'].includes(r.dt)) {
            expr += `.default(${Number(d.replace(/'/g, ''))})`;
        } else {
            expr += `.default(${JSON.stringify(d.replace(/^'|'$/g, '').replace(/''/g, "'"))})`;
        }
    }
    return expr;
}

for (const [t, rs] of tables) {
    const v = camel(t);
    lines.push(`export const ${v} = mysqlTable(${JSON.stringify(t)}, {`);
    for (const r of rs) lines.push(`    ${/^[a-z_][a-z0-9_]*$/i.test(r.c) ? r.c : JSON.stringify(r.c)}: ${colExpr(r)},`);
    lines.push('});', '');
}

const dbTypes = ['dbJson', 'dbTimestamp', 'dbDatetime', 'dbDate'].filter((x) => used.has(x));
const core = [...used].filter((x) => !dbTypes.includes(x) && x !== 'sql').sort();
console.log(`// AUTO-GENERATED by scripts/generate-schema.mjs from ./migrations. Do not edit by hand.
// Property names are snake_case on purpose: they are 1:1 with the original Eloquent attributes.
import { mysqlTable, ${core.join(', ')} } from 'drizzle-orm/mysql-core';
${used.has('sql') ? "import { sql } from 'drizzle-orm';\n" : ''}import { ${dbTypes.join(', ')} } from './types';
`);
console.log(lines.join('\n'));
await conn.end();
