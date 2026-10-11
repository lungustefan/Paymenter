import { Model } from '@/server/orm';
import { settings } from '@/server/db/schema';
import { decryptString, encryptString } from '@/server/lib/crypto';
import { setting as cfgSetting } from '@/server/config';
import type { Row } from './_types';

export interface Setting extends Row<typeof settings> {}

/**
 * Key/value settings. `settingable_*` is null for global settings and points at
 * an Extension / Product for per-record settings.
 *
 * Port of the `Retrieved`/`Saving` events: encrypted values are decrypted on
 * read and encrypted on write; typed values (boolean/integer/float/array) are
 * converted according to the `type` column.
 */
export class Setting extends Model {
    static table = settings;
    static morphName = 'App\\Models\\Setting';
    static fillable = ['key', 'value', 'type', 'encrypted', 'settingable_id', 'settingable_type'];
    static casts = { encrypted: 'boolean' };
    static auditable = true;

    static override attributeModifiers(model: Model<any>): Record<string, (value: any) => any> {
        if (!(model as Setting).encrypted) return {};
        return { value: rightRedact };
    }

    static override booted() {
        this.on('retrieved', (s: Setting) => {
            if (s.encrypted && s.value) {
                try {
                    s.value = decryptString(String(s.value));
                } catch {
                    s.value = null;
                }
            }
            s.value = castValue(s.type, s.value) as any;
            // retrieved values are the baseline for dirty tracking
            s.syncOriginal();
        });

        this.on('saving', (s: Setting) => {
            if (s.encrypted) {
                if (s.value !== null && s.value !== undefined && s.isDirty('value')) {
                    s.value = encryptString(String(s.value));
                }
                return;
            }
            switch (s.type) {
                case 'boolean':
                    s.value = (isTruthy(s.value) ? 1 : 0) as any;
                    break;
                case 'integer':
                    s.value = Number.parseInt(String(s.value), 10) as any;
                    break;
                case 'float':
                    s.value = Number(s.value) as any;
                    break;
                case 'array':
                    if (typeof s.value !== 'string' || !isJson(s.value)) s.value = JSON.stringify(s.value);
                    break;
            }
        });

        this.on('saved', async (s: Setting) => {
            if (s.settingable_type !== null) return;
            // Mirrors the `Saved` event + FlushCacheListener: refresh the in-process snapshot
            const { applySavedSetting } = await import('@/server/settings/store');
            await applySavedSetting(s);
        });
    }
}

function isTruthy(v: unknown): boolean {
    return !(v === false || v === null || v === undefined || v === '' || v === '0' || v === 0 || v === 'false');
}

function isJson(s: string): boolean {
    try {
        return JSON.parse(s) !== null;
    } catch {
        return false;
    }
}

export function castValue(type: string, value: unknown): unknown {
    switch (type) {
        case 'boolean':
            return isTruthy(value);
        case 'integer':
            return Number.parseInt(String(value ?? 0), 10) || 0;
        case 'float':
            return Number(value ?? 0) || 0;
        case 'array':
            if (value === null || value === undefined) return null;
            if (typeof value !== 'string') return value;
            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        default:
            return value;
    }
}

/** App\Redactors\RightRedactor */
function rightRedact(value: unknown): string {
    let v = String(value ?? '');
    try {
        v = decryptString(v);
    } catch {
        /* not encrypted */
    }
    const total = v.length;
    const tenth = Math.ceil(total / 10);
    const length = total > tenth ? total - tenth : 1;
    const head = v.slice(0, -length);
    return head.padEnd(total, '#');
}

void cfgSetting;
