import { fromWallClock, getAppTimezone, wallClock, type WallClock } from './time';

/**
 * A minimal Carbon-compatible date class. Instances are immutable (every
 * mutator returns a new instance). Arithmetic happens on wall-clock fields in
 * the application timezone and `addMonths` overflows like Carbon's default.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

function utcOf(w: WallClock): Date {
    return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second));
}

export class Carbon {
    readonly date: Date;
    readonly tz: string;

    constructor(date: Date | number | string | Carbon = new Date(), tz: string = getAppTimezone()) {
        this.tz = tz;
        if (date instanceof Carbon) this.date = new Date(date.date.getTime());
        else if (date instanceof Date) this.date = new Date(date.getTime());
        else this.date = new Date(date);
    }

    static now(tz?: string): Carbon {
        return new Carbon(new Date(), tz);
    }

    static today(tz?: string): Carbon {
        return Carbon.now(tz).startOfDay();
    }

    /** `Carbon::parse` for the formats used by the app (ISO strings, `Y-m-d H:i:s`, relative keywords). */
    static parse(value: string | Date | Carbon | number, tz: string = getAppTimezone()): Carbon {
        if (value instanceof Carbon) return value;
        if (value instanceof Date || typeof value === 'number') return new Carbon(value, tz);
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
        if (m) {
            if (m[7]) return new Carbon(new Date(value), tz);
            return new Carbon(
                fromWallClock(
                    {
                        year: +m[1],
                        month: +m[2],
                        day: +m[3],
                        hour: +(m[4] ?? 0),
                        minute: +(m[5] ?? 0),
                        second: +(m[6] ?? 0),
                    },
                    tz,
                ),
                tz,
            );
        }
        const lower = value.trim().toLowerCase();
        if (lower === 'now') return Carbon.now(tz);
        if (lower === 'today') return Carbon.today(tz);
        if (lower === 'tomorrow') return Carbon.today(tz).addDay();
        if (lower === 'yesterday') return Carbon.today(tz).subDay();
        const t = new Date(value);
        if (Number.isNaN(t.getTime())) throw new Error(`Could not parse '${value}' as a date`);
        return new Carbon(t, tz);
    }

    static createFromTimestamp(ts: number, tz?: string): Carbon {
        return new Carbon(new Date(ts * 1000), tz);
    }

    static createFromDate(year: number, month: number, day: number, tz: string = getAppTimezone()): Carbon {
        return new Carbon(fromWallClock({ year, month, day, hour: 0, minute: 0, second: 0 }, tz), tz);
    }

    copy(): Carbon {
        return new Carbon(this.date, this.tz);
    }

    get fields(): WallClock {
        return wallClock(this.date, this.tz);
    }

    get year() { return this.fields.year; }
    get month() { return this.fields.month; }
    get day() { return this.fields.day; }
    get hour() { return this.fields.hour; }
    get minute() { return this.fields.minute; }
    get second() { return this.fields.second; }
    get timestamp() { return Math.floor(this.date.getTime() / 1000); }
    get dayOfWeek() { return utcOf(this.fields).getUTCDay(); }
    get daysInMonth() { return new Date(Date.UTC(this.year, this.month, 0)).getUTCDate(); }

    private withFields(patch: Partial<WallClock>): Carbon {
        const f = { ...this.fields, ...patch };
        // normalise overflow through a UTC date (this reproduces Carbon's overflow behaviour)
        const n = utcOf(f);
        return new Carbon(
            fromWallClock(
                {
                    year: n.getUTCFullYear(),
                    month: n.getUTCMonth() + 1,
                    day: n.getUTCDate(),
                    hour: n.getUTCHours(),
                    minute: n.getUTCMinutes(),
                    second: n.getUTCSeconds(),
                },
                this.tz,
            ),
            this.tz,
        );
    }

    addYears(n = 1) { return this.withFields({ year: this.year + n }); }
    addYear() { return this.addYears(1); }
    subYears(n = 1) { return this.addYears(-n); }
    subYear() { return this.addYears(-1); }
    addMonths(n = 1) { return this.withFields({ month: this.month + n }); }
    addMonth() { return this.addMonths(1); }
    subMonths(n = 1) { return this.addMonths(-n); }
    subMonth() { return this.addMonths(-1); }
    addWeeks(n = 1) { return this.addDays(n * 7); }
    addWeek() { return this.addWeeks(1); }
    subWeeks(n = 1) { return this.addDays(-n * 7); }
    subWeek() { return this.addWeeks(-1); }
    addDays(n = 1) { return this.withFields({ day: this.day + n }); }
    addDay() { return this.addDays(1); }
    subDays(n = 1) { return this.addDays(-n); }
    subDay() { return this.addDays(-1); }
    addHours(n = 1) { return new Carbon(new Date(this.date.getTime() + n * 3_600_000), this.tz); }
    addHour() { return this.addHours(1); }
    subHours(n = 1) { return this.addHours(-n); }
    addMinutes(n = 1) { return new Carbon(new Date(this.date.getTime() + n * 60_000), this.tz); }
    addMinute() { return this.addMinutes(1); }
    subMinutes(n = 1) { return this.addMinutes(-n); }
    addSeconds(n = 1) { return new Carbon(new Date(this.date.getTime() + n * 1000), this.tz); }
    subSeconds(n = 1) { return this.addSeconds(-n); }

    /** `add{Unit}s` with the billing unit stored on plans ('hour' | 'day' | 'week' | 'month' | 'year'). */
    addUnit(unit: string, amount: number): Carbon {
        switch (unit) {
            case 'hour': return this.addHours(amount);
            case 'day': return this.addDays(amount);
            case 'week': return this.addWeeks(amount);
            case 'month': return this.addMonths(amount);
            case 'year': return this.addYears(amount);
        }
        throw new Error(`Unknown unit "${unit}"`);
    }

    startOfDay() { return this.withFields({ hour: 0, minute: 0, second: 0 }); }
    endOfDay() { return this.withFields({ hour: 23, minute: 59, second: 59 }); }
    startOfMonth() { return this.withFields({ day: 1, hour: 0, minute: 0, second: 0 }); }
    endOfMonth() { return this.withFields({ day: this.daysInMonth, hour: 23, minute: 59, second: 59 }); }
    startOfYear() { return this.withFields({ month: 1, day: 1, hour: 0, minute: 0, second: 0 }); }
    setTime(h: number, m = 0, s = 0) { return this.withFields({ hour: h, minute: m, second: s }); }

    timezone(tz: string) { return new Carbon(this.date, tz); }

    valueOf() { return this.date.getTime(); }
    toDate() { return new Date(this.date.getTime()); }

    gt(o: Carbon | Date) { return this.valueOf() > +o; }
    gte(o: Carbon | Date) { return this.valueOf() >= +o; }
    lt(o: Carbon | Date) { return this.valueOf() < +o; }
    lte(o: Carbon | Date) { return this.valueOf() <= +o; }
    eq(o: Carbon | Date) { return this.valueOf() === +o; }
    isAfter(o: Carbon | Date) { return this.gt(o); }
    isBefore(o: Carbon | Date) { return this.lt(o); }
    isPast() { return this.valueOf() < Date.now(); }
    isFuture() { return this.valueOf() > Date.now(); }
    isToday() { return this.format('Y-m-d') === Carbon.now(this.tz).format('Y-m-d'); }
    between(a: Carbon | Date, b: Carbon | Date, equal = true) {
        const v = this.valueOf();
        return equal ? v >= +a && v <= +b : v > +a && v < +b;
    }

    diffInSeconds(o: Carbon | Date = new Date(), absolute = false): number {
        const d = (+o - this.valueOf()) / 1000;
        return absolute ? Math.abs(d) : d;
    }
    diffInMinutes(o: Carbon | Date = new Date(), absolute = false) { return this.diffInSeconds(o, absolute) / 60; }
    diffInHours(o: Carbon | Date = new Date(), absolute = false) { return this.diffInSeconds(o, absolute) / 3600; }
    diffInDays(o: Carbon | Date = new Date(), absolute = false): number {
        const d = this.diffInSeconds(o, false) / 86400;
        return absolute ? Math.abs(d) : d;
    }
    /** Whole calendar days between the two dates (used where the PHP code truncates to an int). */
    diffInWholeDays(o: Carbon | Date = new Date(), absolute = true): number {
        const other = o instanceof Carbon ? o : new Carbon(o, this.tz);
        const a = Date.UTC(this.year, this.month - 1, this.day);
        const b = Date.UTC(other.year, other.month - 1, other.day);
        const d = Math.trunc((b - a) / 86400000);
        return absolute ? Math.abs(d) : d;
    }

    /**
     * Carbon's `diffForHumans()`: one unit, truncated, with English phrases
     * (translations of the unit names come from `Intl.RelativeTimeFormat`).
     */
    diffForHumans(other: Carbon | Date | null = null, locale = 'en'): string {
        const ref = other ?? new Date();
        let seconds = (+ref - this.valueOf()) / 1000;
        const past = seconds >= 0;
        seconds = Math.abs(seconds);
        const units: [Intl.RelativeTimeFormatUnit, number][] = [
            ['year', 31536000],
            ['month', 2592000],
            ['week', 604800],
            ['day', 86400],
            ['hour', 3600],
            ['minute', 60],
            ['second', 1],
        ];
        let value = 0;
        let unit: Intl.RelativeTimeFormatUnit = 'second';
        for (const [u, s] of units) {
            if (seconds >= s) {
                value = Math.floor(seconds / s);
                unit = u;
                break;
            }
        }
        if (value === 0) {
            value = 0;
            unit = 'second';
        }
        let rtf: Intl.RelativeTimeFormat;
        try {
            rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
        } catch {
            rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
        }
        if (value === 0) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
        return rtf.format(past ? -value : value, unit);
    }

    /** PHP `date()` formatting. */
    format(fmt: string): string {
        const f = this.fields;
        const dow = this.dayOfWeek;
        let out = '';
        for (let i = 0; i < fmt.length; i++) {
            const c = fmt[i];
            switch (c) {
                case '\\': out += fmt[++i] ?? ''; break;
                case 'd': out += pad(f.day); break;
                case 'D': out += DAYS[dow].slice(0, 3); break;
                case 'j': out += f.day; break;
                case 'l': out += DAYS[dow]; break;
                case 'N': out += dow === 0 ? 7 : dow; break;
                case 'S': out += f.day % 10 === 1 && f.day !== 11 ? 'st' : f.day % 10 === 2 && f.day !== 12 ? 'nd' : f.day % 10 === 3 && f.day !== 13 ? 'rd' : 'th'; break;
                case 'w': out += dow; break;
                case 'z': out += Math.floor((Date.UTC(f.year, f.month - 1, f.day) - Date.UTC(f.year, 0, 1)) / 86400000); break;
                case 'F': out += MONTHS[f.month - 1]; break;
                case 'm': out += pad(f.month); break;
                case 'M': out += MONTHS[f.month - 1].slice(0, 3); break;
                case 'n': out += f.month; break;
                case 't': out += this.daysInMonth; break;
                case 'L': out += (f.year % 4 === 0 && f.year % 100 !== 0) || f.year % 400 === 0 ? 1 : 0; break;
                case 'Y': out += f.year; break;
                case 'y': out += pad(f.year % 100); break;
                case 'a': out += f.hour < 12 ? 'am' : 'pm'; break;
                case 'A': out += f.hour < 12 ? 'AM' : 'PM'; break;
                case 'g': out += f.hour % 12 || 12; break;
                case 'G': out += f.hour; break;
                case 'h': out += pad(f.hour % 12 || 12); break;
                case 'H': out += pad(f.hour); break;
                case 'i': out += pad(f.minute); break;
                case 's': out += pad(f.second); break;
                case 'u': out += '000000'; break;
                case 'v': out += String(this.date.getUTCMilliseconds()).padStart(3, '0'); break;
                case 'e': out += this.tz; break;
                case 'O': case 'P': {
                    const off = (Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(this.date.getTime() / 1000) * 1000) / 60000;
                    const sign = off >= 0 ? '+' : '-';
                    const a = Math.abs(off);
                    out += `${sign}${pad(Math.floor(a / 60))}${c === 'P' ? ':' : ''}${pad(a % 60)}`;
                    break;
                }
                case 'T': out += this.tz === 'UTC' ? 'UTC' : this.tz; break;
                case 'U': out += this.timestamp; break;
                case 'c': out += this.toIso8601String(); break;
                case 'r': out += `${DAYS[dow].slice(0, 3)}, ${pad(f.day)} ${MONTHS[f.month - 1].slice(0, 3)} ${f.year} ${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)} ${this.format('O')}`; break;
                default: out += c;
            }
        }
        return out;
    }

    toDateString() { return this.format('Y-m-d'); }
    toDateTimeString() { return this.format('Y-m-d H:i:s'); }
    toIso8601String() { return this.format('Y-m-d\\TH:i:sP'); }
    toISOString() { return this.date.toISOString(); }
    /** Laravel serialises dates as UTC with microseconds: 2026-01-01T00:00:00.000000Z */
    toJSON() { return this.date.toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'); }
    toString() { return this.toDateTimeString(); }
}

export function now(): Carbon {
    return Carbon.now();
}

export function today(): Carbon {
    return Carbon.today();
}
