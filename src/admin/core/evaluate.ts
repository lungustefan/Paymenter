/**
 * Filament lets almost every option be a value or a closure that receives what it asks for by
 * parameter name (`fn (Get $get, ?Model $record) => ...`). Here a closure receives one context object
 * (`({ get, record }) => ...`) and may return a promise.
 */
export type Fn<T, C = EvalContext> = T | ((ctx: C) => T | Promise<T>);

export interface EvalContext {
    /** `$get('field')` - state of another field (relative to the current component, `../x` goes up) */
    get: (path: string, isAbsolute?: boolean) => any;
    /** `$set('field', value)` */
    set: (path: string, value: unknown, isAbsolute?: boolean) => void;
    /** the state of the field the closure belongs to */
    state?: any;
    record?: any;
    operation?: string;
    user?: any;
    /** the page / table / action the component lives in */
    livewire?: any;
    component?: any;
    [key: string]: any;
}

export async function evaluate<T, C extends EvalContext = EvalContext>(value: Fn<T, C> | undefined, ctx: C): Promise<T | undefined> {
    if (typeof value === 'function') return (value as (ctx: C) => T | Promise<T>)(ctx);
    return value;
}

/** nested state helpers (`data.items.<uuid>.name`) */
export function getPath(obj: any, path: string): any {
    if (!path) return obj;
    let cur = obj;
    for (const key of path.split('.')) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[key];
    }
    return cur;
}

export function setPath(obj: any, path: string, value: unknown): void {
    const keys = path.split('.');
    let cur = obj;
    keys.slice(0, -1).forEach((key, i) => {
        if (cur[key] === null || cur[key] === undefined || typeof cur[key] !== 'object') cur[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        cur = cur[key];
    });
    cur[keys[keys.length - 1]] = value;
}

/** `$get('../x')` style relative path resolution against the container path of a component */
export function resolvePath(container: string, path: string, isAbsolute = false): string {
    if (isAbsolute) return path;
    let base = container ? container.split('.') : [];
    let rest = path;
    while (rest.startsWith('../')) {
        base = base.slice(0, -1);
        rest = rest.slice(3);
    }
    return [...base, rest].filter(Boolean).join('.');
}
