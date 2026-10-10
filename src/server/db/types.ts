import { customType } from 'drizzle-orm/mysql-core';
import { formatDbDate, formatDbDateOnly, parseDbDate, parseDbDateOnly } from '@/server/lib/time';

/**
 * Laravel stores wall-clock timestamps in the application timezone (the
 * `timezone` setting). We keep that exact convention: the MySQL driver is
 * configured with `dateStrings: true` and these column types translate between
 * the stored wall-clock string and a JS Date.
 */
export const dbTimestamp = customType<{ data: Date; driverData: string }>({
    dataType() {
        return 'timestamp';
    },
    fromDriver(value) {
        return parseDbDate(value);
    },
    toDriver(value) {
        return formatDbDate(value);
    },
});

export const dbDatetime = customType<{ data: Date; driverData: string }>({
    dataType() {
        return 'datetime';
    },
    fromDriver(value) {
        return parseDbDate(value);
    },
    toDriver(value) {
        return formatDbDate(value);
    },
});

export const dbDate = customType<{ data: Date; driverData: string }>({
    dataType() {
        return 'date';
    },
    fromDriver(value) {
        return parseDbDateOnly(value);
    },
    toDriver(value) {
        return formatDbDateOnly(value);
    },
});

/**
 * JSON columns. MariaDB stores JSON as LONGTEXT (the driver returns a string)
 * while MySQL returns an already-parsed value, so handle both.
 */
export const dbJson = customType<{ data: any; driverData: string }>({
    dataType() {
        return 'json';
    },
    fromDriver(value: unknown) {
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return value;
    },
    toDriver(value) {
        return JSON.stringify(value);
    },
});
