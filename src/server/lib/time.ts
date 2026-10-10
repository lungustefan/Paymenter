/**
 * Timezone-aware date helpers.
 *
 * The original application ran PHP with `date_default_timezone_set(settings.timezone)`
 * so every timestamp written by Eloquent is a wall-clock string in that zone.
 * These helpers reproduce that behaviour so existing databases stay valid.
 */

let appTimezone = 'UTC';

export function setAppTimezone(tz: string | null | undefined) {
    if (!tz) return;
    try {
        // Validate the identifier
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        appTimezone = tz;
    } catch {
        // keep previous timezone
    }
}

export function getAppTimezone(): string {
    return appTimezone;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
    let f = formatterCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatterCache.set(tz, f);
    }
    return f;
}

export interface WallClock {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
    second: number;
}

/** Break an instant into wall-clock parts in the given zone. */
export function wallClock(date: Date, tz: string = appTimezone): WallClock {
    const parts = formatterFor(tz).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour') % 24,
        minute: get('minute'),
        second: get('second'),
    };
}

/** Offset (ms) of `tz` from UTC at the instant `utcMs`. */
function offsetMs(utcMs: number, tz: string): number {
    const w = wallClock(new Date(utcMs), tz);
    const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Build the instant that has the given wall-clock reading in `tz`. */
export function fromWallClock(w: WallClock, tz: string = appTimezone): Date {
    const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    let result = guess - offsetMs(guess, tz);
    // Re-evaluate around DST transitions
    const second = guess - offsetMs(result, tz);
    if (second !== result) result = second;
    return new Date(result);
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

export function parseDbDate(value: string | Date | null | undefined): Date {
    if (value instanceof Date) return value;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(String(value));
    if (!m) return new Date(NaN);
    return fromWallClock({
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        hour: Number(m[4] ?? 0),
        minute: Number(m[5] ?? 0),
        second: Number(m[6] ?? 0),
    });
}

export function formatDbDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const w = wallClock(d);
    return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
}

/** `date` columns: the day itself (midnight in the app timezone). */
export function parseDbDateOnly(value: string | Date | null | undefined): Date {
    return parseDbDate(typeof value === 'string' ? value.slice(0, 10) : value);
}

export function formatDbDateOnly(date: Date | string): string {
    return formatDbDate(date).slice(0, 10);
}

export function now(): Date {
    return new Date();
}
