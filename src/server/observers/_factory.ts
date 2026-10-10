import { dispatch, type EventDef } from '@/server/events';

type Name = 'creating' | 'created' | 'updating' | 'updated' | 'deleting' | 'deleted';

/**
 * Most observers in the original only forward Eloquent lifecycle events to a
 * domain event (`event(new Invoice\Created($invoice))`). This builds such an
 * observer: `forward(events, 'invoice', ['creating', 'created', ...])`.
 */
export function forward(events: Record<string, EventDef<any>>, key: string, names: Name[]) {
    const obs: Partial<Record<Name, (model: any) => Promise<void>>> = {};
    for (const n of names) {
        const ev = events[n.charAt(0).toUpperCase() + n.slice(1)];
        if (!ev) continue;
        obs[n] = async (model: any) => {
            await dispatch(ev, { [key]: model });
        };
    }
    return obs;
}
