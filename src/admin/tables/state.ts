/**
 * The state of a table lives in the URL, like the `#[Url]` properties of Filament's ListRecords:
 * `?search=…&sort=column:direction&filters[status][value]=x&page=2&grouping=…&tab=…`.
 * (`perPage` is kept in the URL too; Filament keeps it in the Livewire state.)
 */
export interface TableState {
    search: string;
    sortColumn: string | null;
    sortDirection: 'asc' | 'desc' | null;
    filters: Record<string, any>;
    page: number;
    perPage: number | 'all' | null;
    grouping: string | null;
    tab: string | null;
    reordering: boolean;
    /** `tableColumnSearches[col]` */
    columnSearches: Record<string, string>;
    /** columns the user hid with the column manager (`columns[name]=0`)  */
    hiddenColumns: string[] | null;
}

type Params = Record<string, string | string[] | undefined>;

/** nested keys of a flat query (`filters[a][b]=1` -> `{ a: { b: '1' } }`) under a prefix */
export function nested(params: Params, prefix: string): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, raw] of Object.entries(params)) {
        if (!key.startsWith(`${prefix}[`)) continue;
        const parts = [...key.slice(prefix.length).matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
        let cur = out;
        parts.forEach((part, i) => {
            const last = i === parts.length - 1;
            const value = Array.isArray(raw) ? raw[0] : raw;
            if (last) cur[part] = value;
            else cur = cur[part] ??= {};
        });
    }
    return out;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseTableState(params: Params, prefix = ''): TableState {
    const key = (name: string) => (prefix ? `${prefix}.${name}` : name);
    const sort = first(params[key('sort')]);
    const [sortColumn, sortDir] = sort ? sort.split(':') : [null, null];
    const perPage = first(params[key('perPage')]);
    const columns = nested(params, key('columns'));
    return {
        search: first(params[key('search')]) ?? '',
        sortColumn: sortColumn ?? null,
        sortDirection: sortColumn ? (sortDir === 'desc' ? 'desc' : 'asc') : null,
        filters: nested(params, key('filters')),
        page: Math.max(1, Number(first(params[key('page')]) ?? 1) || 1),
        perPage: perPage === 'all' ? 'all' : perPage ? Number(perPage) || null : null,
        grouping: first(params[key('grouping')]) ?? null,
        tab: first(params[key('tab')]) ?? null,
        reordering: first(params[key('reordering')]) === '1' || first(params[key('reordering')]) === 'true',
        columnSearches: nested(params, key('columnSearches')),
        hiddenColumns: Object.keys(columns).length ? Object.entries(columns).filter(([, v]) => v === '0').map(([k]) => k) : null,
    };
}

/** `/path?x=1` with the given params replaced (`null` removes). Nested objects become `a[b][c]`. */
export function buildQuery(current: URLSearchParams | string, updates: Record<string, any>): string {
    const params = new URLSearchParams(typeof current === 'string' ? current : current.toString());
    const set = (key: string, value: any) => {
        for (const existing of [...params.keys()]) if (existing === key || existing.startsWith(`${key}[`)) params.delete(existing);
        if (value === null || value === undefined || value === '') return;
        if (typeof value === 'object' && !Array.isArray(value)) {
            const walk = (obj: any, path: string) => {
                for (const [k, v] of Object.entries(obj)) {
                    if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}[${k}]`);
                    else if (Array.isArray(v)) v.forEach((item, i) => params.append(`${path}[${k}][${i}]`, String(item)));
                    else if (v !== null && v !== undefined && v !== '') params.append(`${path}[${k}]`, String(v));
                }
            };
            walk(value, key);
        } else params.set(key, String(value));
    };
    for (const [k, v] of Object.entries(updates)) set(k, v);
    return params.toString();
}
