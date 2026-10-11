import { dispatch, type EventDef } from '@/server/events';

function flatten(results: unknown[]): any[] {
    return results.reduce<any[]>((carry, item) => {
        if (item === null || item === undefined || (Array.isArray(item) && item.length === 0)) return carry;
        // multidimensional array -> merge
        return Array.isArray(item) ? [...carry, ...item] : [...carry, item];
    }, []);
}

/** Port of App\Helpers\EventHelper. */
export class EventHelper {
    /** Collect items from listeners and merge them into `items`, sorted by priority. */
    static async itemEvent<T extends { priority?: number }>(event: EventDef<any> | string, items: T[]): Promise<T[]> {
        const eventItems = flatten(await dispatch(event, {} as any));
        return [...items, ...eventItems].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    /** `hook('event')`: concatenates the `view` HTML of every listener result, sorted by priority. */
    static async renderEvent(event: EventDef<any> | string): Promise<string> {
        const items = flatten(await dispatch(event, {} as any)).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        let html = '';
        for (const item of items) if (item && typeof item === 'object' && 'view' in item) html += item.view;
        return html;
    }
}
