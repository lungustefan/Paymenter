import { describe, expect, it } from 'vitest';
import { normalizeConfigOptions } from '@/server/pages/checkout';

const radio = { id: 1, type: 'radio', children: [{ id: 10 }, { id: 11 }] };

describe('normalizeConfigOptions (cart item edit, upstream #1207)', () => {
    it('falls back to the first value when the stored option value was removed', () => {
        expect(normalizeConfigOptions([radio], { '1': 99 })).toEqual({ '1': 10 });
    });

    it('keeps a stored value that is still available', () => {
        expect(normalizeConfigOptions([radio], { '1': 11 })).toEqual({ '1': 11 });
        expect(normalizeConfigOptions([radio], { '1': '11' })).toEqual({ '1': '11' });
    });

    it('adds options the product gained since the item was added, and drops removed ones', () => {
        const out = normalizeConfigOptions([radio, { id: 2, type: 'text', children: [] }, { id: 3, type: 'checkbox', children: [{ id: 30 }] }], { '1': 10, '7': 'gone' });
        expect(out).toEqual({ '1': 10, '2': null, '3': false });
    });

    it('treats checkboxes as booleans', () => {
        const box = { id: 3, type: 'checkbox', children: [{ id: 30 }] };
        expect(normalizeConfigOptions([box], { '3': true })).toEqual({ '3': true });
        expect(normalizeConfigOptions([box], { '3': 'true' })).toEqual({ '3': true });
        expect(normalizeConfigOptions([box], { '3': 'false' })).toEqual({ '3': false });
    });
});
