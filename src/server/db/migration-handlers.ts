import type { PoolConnection } from 'mysql2/promise';

/**
 * Data migrations that cannot be expressed as plain SQL. They run after the
 * SQL file with the same name has been applied.
 */
export const afterMigration: Record<string, (conn: PoolConnection) => Promise<void>> = {};
