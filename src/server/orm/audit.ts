import { Carbon } from '@/server/lib/carbon';
import { envBool } from '@/server/env';
import { getRequestInfo } from '@/server/request';
import { formatDbDate } from '@/server/lib/time';
import { currentDb } from './context';
import { audits } from '@/server/db/schema';
import type { Model } from './model';

/**
 * Port of owen-it/laravel-auditing as configured by the original app
 * (events: created/updated/deleted/restored, console auditing off,
 * timestamps excluded, non-scalar values excluded).
 */

let auditConsole = false;

/** `Config::set('audit.console', true)`: record audits even while running in the CLI (cron job, user:create ...). */
export function setAuditConsole(enabled: boolean) {
    auditConsole = enabled;
}

export type AuditEvent = 'created' | 'updated' | 'deleted' | 'restored' | string;

function scalar(value: unknown): unknown {
    if (value instanceof Carbon) return value.toDateTimeString();
    if (value instanceof Date) return formatDbDate(value);
    return value;
}

function isAuditable(model: Model<any>, attribute: string): boolean {
    const ctor = model.ctor;
    const include = ctor.auditInclude;
    if (include.length > 0) return include.includes(attribute);
    const excluded = new Set<string>([...ctor.auditExclude, 'created_at', 'updated_at']);
    if (ctor.softDeletes) excluded.add('deleted_at');
    if (excluded.has(attribute)) return false;
    const v = (model as any)[attribute];
    // arrays / plain objects are not auditable (config: allowed_array_values = false)
    if (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Carbon) && !(v instanceof Date))) return false;
    return true;
}

export interface CustomAudit {
    old?: Record<string, unknown>;
    new?: Record<string, unknown>;
}

export async function recordAudit(model: Model<any>, event: AuditEvent, custom?: CustomAudit): Promise<void> {
    const ctor = model.ctor;
    if (!ctor.auditable || !envBool('AUDITING_ENABLED', true)) return;

    const req = await getRequestInfo();
    if (req.runningInConsole && !auditConsole) return; // config('audit.console') === false

    let oldValues: Record<string, unknown> = {};
    let newValues: Record<string, unknown> = {};

    if (custom) {
        oldValues = custom.old ?? {};
        newValues = custom.new ?? {};
    } else if (event === 'created') {
        for (const col of ctor.columnNames()) if (isAuditable(model, col)) newValues[col] = scalar((model as any)[col]);
    } else if (event === 'updated') {
        const dirty = model.getChanges();
        for (const col of Object.keys(dirty)) {
            if (!isAuditable(model, col)) continue;
            oldValues[col] = scalar(model.$original[col]);
            newValues[col] = scalar((model as any)[col]);
        }
        if (Object.keys(newValues).length === 0) return;
    } else if (event === 'deleted') {
        for (const col of ctor.columnNames()) if (isAuditable(model, col)) oldValues[col] = scalar((model as any)[col]);
    } else if (event === 'restored') {
        for (const col of ctor.columnNames()) if (isAuditable(model, col)) newValues[col] = scalar((model as any)[col]);
    }

    // Attribute modifiers (e.g. Setting redacts encrypted values)
    const modifiers = ctor.attributeModifiers(model);
    if (!custom) {
        for (const [attr, fn] of Object.entries(modifiers)) {
            if (attr in oldValues) oldValues[attr] = fn(oldValues[attr]);
            if (attr in newValues) newValues[attr] = fn(newValues[attr]);
        }
    }

    const { getAuditUserId } = await import('@/server/auth/audit-user');
    const userId = await getAuditUserId();
    const tags = req.url && req.url.includes('/admin') ? 'admin' : null;

    await currentDb().insert(audits).values({
        user_type: userId ? 'App\\Models\\User' : null,
        user_id: userId,
        event,
        auditable_type: ctor.morphName,
        auditable_id: Number((model as any)[ctor.primaryKey]),
        old_values: JSON.stringify(oldValues),
        new_values: JSON.stringify(newValues),
        url: req.url,
        ip_address: req.ip,
        user_agent: req.userAgent ? req.userAgent.slice(0, 1023) : null,
        tags,
        created_at: Carbon.now(),
        updated_at: Carbon.now(),
    } as any);
}
