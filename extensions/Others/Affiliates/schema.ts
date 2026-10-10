import { mysqlTable, bigint, boolean, int, varchar } from 'drizzle-orm/mysql-core';
import { dbTimestamp } from '@/server/db/types';

export const extAffiliates = mysqlTable('ext_affiliates', {
    id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
    user_id: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    code: varchar('code', { length: 255 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    reward: int('reward', { unsigned: true }),
    discount: int('discount', { unsigned: true }),
    visitors: int('visitors', { unsigned: true }).notNull().default(0),
    signups: int('signups', { unsigned: true }).notNull().default(0),
    created_at: dbTimestamp('created_at'),
    updated_at: dbTimestamp('updated_at'),
});

export const extAffiliateOrders = mysqlTable('ext_affiliate_orders', {
    id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
    affiliate_id: bigint('affiliate_id', { mode: 'number', unsigned: true }).notNull(),
    order_id: bigint('order_id', { mode: 'number', unsigned: true }).notNull(),
});
