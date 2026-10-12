/**
 * Typed event bus - the equivalent of Laravel's `event()` / `Event::listen()`.
 *
 * Every event keeps the fully-qualified PHP class name as its key
 * (e.g. `App\Events\Invoice\Paid`) so identifiers in docs, logs and
 * extensions stay recognisable.
 */

export interface EventDef<T = any> {
    readonly key: string;
    /** phantom type carrier */
    readonly __payload?: T;
}

export function defineEvent<T = any>(key: string): EventDef<T> {
    return { key };
}

type Listener<T> = (payload: T) => unknown | Promise<unknown>;

interface Registered {
    fn: Listener<any>;
    queued: boolean;
    name?: string;
}

const listeners = new Map<string, Registered[]>();

/** Hook consulted for queued listeners (set by the queue module). */
let queueDispatcher: ((listenerName: string, key: string, payload: unknown) => Promise<void>) | null = null;
export function setListenerQueueDispatcher(fn: typeof queueDispatcher) {
    queueDispatcher = fn;
}

const namedListeners = new Map<string, Listener<any>>();
export function getNamedListener(name: string) {
    return namedListeners.get(name);
}

export function listen<T>(event: EventDef<T> | string, fn: Listener<T>, options: { queued?: boolean; name?: string } = {}) {
    const key = typeof event === 'string' ? event : event.key;
    const list = listeners.get(key) ?? [];
    list.push({ fn, queued: !!options.queued, name: options.name });
    if (options.name) namedListeners.set(options.name, fn);
    listeners.set(key, list);
}

export function forgetListeners(event: EventDef<any> | string) {
    listeners.delete(typeof event === 'string' ? event : event.key);
}

/**
 * Dispatch an event. Returns every listener's return value (Laravel's
 * `Event::dispatch()`), which the hook system (`hook()`, nav items) relies on.
 */
export async function dispatch<T>(event: EventDef<T> | string, payload: T = {} as T): Promise<unknown[]> {
    const key = typeof event === 'string' ? event : event.key;
    const results: unknown[] = [];
    for (const l of listeners.get(key) ?? []) {
        if (l.queued && queueDispatcher && l.name) {
            await queueDispatcher(l.name, key, payload);
            continue;
        }
        const r = await l.fn(payload);
        results.push(r);
    }
    return results;
}

export function hasListeners(event: EventDef<any> | string): boolean {
    return (listeners.get(typeof event === 'string' ? event : event.key)?.length ?? 0) > 0;
}
