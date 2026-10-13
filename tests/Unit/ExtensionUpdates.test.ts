import { describe, expect, it } from 'vitest';
import { addonStatus, compareVersions, isComparableVersion } from '@/server/extensions/updates';

describe('extension update status (upstream c2ce0a8a)', () => {
    it('recognises comparable versions', () => {
        for (const v of ['1', '1.2.3', '1.0.0-beta.1', '2.0.0+build.5']) expect(isComparableVersion(v)).toBe(true);
        for (const v of ['unknown', 'builtin', 'v1.0', '', null]) expect(isComparableVersion(v as any)).toBe(false);
    });

    it('compares versions', () => {
        expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
        expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    });

    it('derives the status', () => {
        expect(addonStatus('builtin', '1.5.9', null, true)).toBe('Builtin');
        expect(addonStatus('1.0.0', '1.0.0', '1.0.0', false)).toBe('Unknown');
        expect(addonStatus('1.0.0', '1.0.0', null, true)).toBe('Unknown'); // offline marketplace
        expect(addonStatus('abc', 'abc', '1.0.0', true)).toBe('Error');
        expect(addonStatus('1.0.0', '1.0.0', '1.1.0', true)).toBe('Update available');
        expect(addonStatus('1.1.0', '1.1.0', '1.1.0', true)).toBe('Up to date');
    });
});
