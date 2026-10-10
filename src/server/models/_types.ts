import type { InferSelectModel } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';

/** Row type of a Drizzle table (the columns of a model). */
export type Row<T extends MySqlTable> = InferSelectModel<T>;
