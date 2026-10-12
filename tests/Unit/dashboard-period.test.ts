import { describe, expect, it } from 'vitest';
import { DashboardPeriod } from '@/server/enums';
import { Carbon } from '@/server/lib/carbon';

describe('DashboardPeriod', () => {
    it('defaults to 30 days and falls back for unknown values', () => {
        expect(DashboardPeriod.default().value).toBe('month');
        expect(DashboardPeriod.fromValue('bogus')).toBe(DashboardPeriod.Month);
        expect(DashboardPeriod.fromValue(null)).toBe(DashboardPeriod.Month);
        expect(DashboardPeriod.fromValue('year')).toBe(DashboardPeriod.Year);
    });

    it('lists the filter options', () => {
        expect(DashboardPeriod.options()).toEqual({ today: 'Last 24 hours', week: 'Last 7 days', month: 'Last 30 days', year: 'Last 365 days' });
    });

    it('counts back from a given date, so the previous period ends where the current one starts', () => {
        const start = DashboardPeriod.Week.start(Carbon.parse('2026-10-12 15:30:00'));
        expect(start.toDateTimeString()).toBe('2026-10-05 00:00:00');
        expect(DashboardPeriod.Week.start(start).toDateTimeString()).toBe('2026-09-28 00:00:00');
        expect(DashboardPeriod.Year.interval()).toBe('month');
        expect(DashboardPeriod.Day.dateFormat()).toBe('H:i');
    });
});
