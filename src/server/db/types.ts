import { customType } from 'drizzle-orm/mysql-core';
import { Carbon } from '@/server/lib/carbon';
import { formatDbDate, formatDbDateOnly, parseDbDate, parseDbDateOnly } from '@/server/lib/time';

type DateLike = Carbon | Date | string;

const toDate = (v: DateLike): Date => (v instanceof Carbon ? v.toDate() : v instanceof Date ? v : Carbon.parse(v).toDate());

/**
 * Laravel stores wall-clock timestamps in the application timezone (the
 * `timezone` setting). We keep that exact convention: the MySQL driver is
 * configured with `dateStrings: true` and these column types translate between
 * the stored wall-clock string and a JS Date.
 */
export const dbTimestamp = customType<{ data: Carbon; driverData: string }>({
    dataType() {
        return 'timestamp';
    },
    fromDriver(value) {
        return new Carbon(parseDbDate(value));
    },
    toDriver(value) {
        return formatDbDate(toDate(value));
    },
});

export const dbDatetime = customType<{ data: Carbon; driverData: string }>({
    dataType() {
        return 'datetime';
    },
    fromDriver(value) {
        return new Carbon(parseDbDate(value));
    },
    toDriver(value) {
        return formatDbDate(toDate(value));
    },
});

export const dbDate = customType<{ data: Carbon; driverData: string }>({
    dataType() {
        return 'date';
    },
    fromDriver(value) {
        return new Carbon(parseDbDateOnly(value));
    },
    toDriver(value) {
        return formatDbDateOnly(toDate(value));
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
