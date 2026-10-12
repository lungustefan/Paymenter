import { Model } from '@/server/orm';
import { Carbon } from '@/server/lib/carbon';

/** relations that are sent along with a model so `$service->user` etc. need no round trip */
const PRELOAD: Record<string, string[]> = {
    Service: ['user', 'product'],
    Invoice: ['user', 'items'],
    Order: ['user'],
    BillingAgreement: ['user'],
    Ticket: ['user'],
    TicketMessage: ['user'],
};

const modelName = (m: Model<any>): string => {
    const morph = (m.constructor as any).morphName as string | undefined;
    return (morph ? morph.split('\\').pop() : m.constructor.name) ?? m.constructor.name;
};

/** Convert panel values to JSON for PHP: models become `{__model, attributes, relations}` (shim `App\Models\X`). */
export async function marshal(v: any, depth = 0): Promise<any> {
    if (v === null || v === undefined) return null;
    if (v instanceof Model) {
        const name = modelName(v);
        const relations: Record<string, any> = {};
        if (depth < 2) {
            for (const rel of PRELOAD[name] ?? []) {
                try {
                    const data = await (v as any).rel(rel);
                    relations[rel] = Array.isArray(data) ? await Promise.all(data.map((x: any) => marshal(x, depth + 1))) : await marshal(data, depth + 1);
                } catch {
                    /* relation not defined on this schema */
                }
            }
        }
        const changes = v.getChanges();
        const original = v.getOriginal();
        const routeKey = typeof (v as any).getRouteKey === 'function' ? String((v as any).getRouteKey()) : undefined;
        return { __model: name, routeKey, attributes: v.attributesToArray(), relations, changes: await marshal(changes, depth + 1), original: depth === 0 && Object.keys(changes ?? {}).length ? await marshal(original, depth + 1) : undefined };
    }
    if (v instanceof Carbon) return v.toDateTimeString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return Promise.all(v.map((x) => marshal(x, depth)));
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'object') {
        const out: Record<string, any> = {};
        for (const [k, x] of Object.entries(v)) out[k] = await marshal(x, depth);
        return out;
    }
    if (typeof v === 'function') return null;
    return v;
}
