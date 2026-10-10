import { mysqlTable, bigint, boolean, text, varchar } from 'drizzle-orm/mysql-core';
import { dbDatetime, dbTimestamp } from '@/server/db/types';

export const extAnnouncements = mysqlTable('ext_announcements', {
    id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
    title: varchar('title', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    content: text('content').notNull(),
    is_active: boolean('is_active').notNull().default(true),
    published_at: dbDatetime('published_at'),
    slug: varchar('slug', { length: 255 }).notNull(),
    created_at: dbTimestamp('created_at'),
    updated_at: dbTimestamp('updated_at'),
});
