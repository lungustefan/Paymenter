/**
 * `dispatch(fn)->afterResponse()` / `app()->terminating()`.
 *
 * In a web request the work runs after the response has been sent (Next's
 * `after()`); in the CLI / queue worker it runs when the command or job ends.
 */
const callbacks: Array<() => void | Promise<void>> = [];

export async function afterResponse(fn: () => void | Promise<void>): Promise<void> {
    try {
        const { after } = await import('next/server');
        after(fn);
        return;
    } catch {
        callbacks.push(fn);
    }
}

export async function flushTerminating(): Promise<void> {
    while (callbacks.length) {
        const cb = callbacks.shift()!;
        try {
            await cb();
        } catch (e) {
            console.error('[terminating]', e);
        }
    }
}
