/** leaf paths of a nested state (`{ a: { b: 1 } }` -> `{ 'a.b': 1 }`); arrays are leaves */
export function flatten(obj: any, prefix = '', out: Record<string, any> = {}): Record<string, any> {
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    } else out[prefix] = obj;
    return out;
}
