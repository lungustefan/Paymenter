import permissionsConfig from '@/server/data/permissions.json';
import { dispatch } from '@/server/events';

/** `Arr::dot()` */
export function dot(input: Record<string, any>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) Object.assign(out, dot(value, `${prefix}${key}.`));
        else out[`${prefix}${key}`] = value as string;
    }
    return out;
}

/** `Arr::dot(array_merge_recursive(...Event::dispatch($event)))` */
async function fromExtensions(event: string): Promise<Record<string, string>> {
    const merged: Record<string, string> = {};
    for (const result of await dispatch(event, {})) {
        if (result && typeof result === 'object') Object.assign(merged, dot(result as Record<string, any>));
    }
    return merged;
}

/** the permissions a role can have (core + extensions) */
export async function rolePermissions(): Promise<Record<string, string>> {
    return { ...dot((permissionsConfig as any).role), ...(await fromExtensions('permissions')) };
}

/** the permissions an API key can have (core + extensions) */
export async function apiPermissions(): Promise<Record<string, string>> {
    return { ...dot((permissionsConfig as any).api), ...(await fromExtensions('api.permissions')) };
}
