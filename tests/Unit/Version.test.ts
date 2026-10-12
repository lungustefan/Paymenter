import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '@/server/version';

describe('isNewerVersion', () => {
    it('compares releases and prereleases', () => {
        expect(isNewerVersion('1.5.9', '2.0.0-alpha.4')).toBe(false);
        expect(isNewerVersion('2.0.0', '2.0.0-alpha.4')).toBe(true);
        expect(isNewerVersion('2.0.0-alpha.10', '2.0.0-alpha.4')).toBe(true);
        expect(isNewerVersion('2.0.0-alpha.4', '2.0.0-alpha.4')).toBe(false);
        expect(isNewerVersion('2.1.0', '2.0.9')).toBe(true);
        expect(isNewerVersion('1.5.9', 'development')).toBe(true);
    });
});
