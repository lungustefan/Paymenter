import { describe, expect, it } from 'vitest';
import { Carbon } from '@/server/lib/carbon';

describe('Carbon translatedFormat', () => {
    const date = Carbon.parse('2026-09-05 10:00:00', 'UTC');

    it('formats like format() in English', () => {
        expect(date.translatedFormat('d M Y')).toBe('05 Sep 2026');
        expect(date.translatedFormat('M j, Y', 'en')).toBe(date.format('M j, Y'));
        expect(date.translatedFormat('d M Y', 'en_US')).toBe('05 Sep 2026');
    });

    it('translates the day and month names', () => {
        expect(date.translatedFormat('d M Y', 'fr')).toBe('05 sept. 2026');
        expect(date.translatedFormat('l, j F Y', 'de')).toBe('Samstag, 5 September 2026');
        expect(date.translatedFormat('D', 'nl')).toBe('za');
    });

    it('keeps the letters of a translated name and escaped characters literal', () => {
        // `déc.` contains the format characters d and c
        expect(Carbon.parse('2026-12-07 10:00:00', 'UTC').translatedFormat('d M Y', 'fr')).toBe('07 déc. 2026');
        expect(date.translatedFormat('\\M M', 'fr')).toBe('M sept.');
    });

    it('names the day of the wall-clock date', () => {
        // 23:30 UTC on 30 September is 1 October in Amsterdam
        const late = new Carbon(new Date(Date.UTC(2026, 8, 30, 23, 30)), 'Europe/Amsterdam');
        expect(late.translatedFormat('l d M Y', 'de')).toBe('Donnerstag 01 Okt 2026');
    });

    it('uses the English names for a language Intl does not know', () => {
        expect(date.translatedFormat('d M Y', 'xx')).toBe('05 Sep 2026');
    });
});
