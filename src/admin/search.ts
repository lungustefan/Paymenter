'use server';

import { requireAdminUser } from './server/auth';
import { panelResources } from './core/registry';
import { adminRequest } from './router';
import { runAdmin } from './context';
import './panel';

export interface SearchGroup {
    label: string;
    results: Array<{ title: string; url: string }>;
}

/** `Filament\Livewire\GlobalSearch::getResults()` */
export async function globalSearch(query: string): Promise<SearchGroup[]> {
    const user = await requireAdminUser();
    const term = query.trim();
    if (!term) return [];
    return runAdmin(await adminRequest(user, '/admin', {}), async () => {
        const groups: SearchGroup[] = [];
        for (const resource of panelResources()) {
            const attributes = resource.getGloballySearchableAttributes();
            if (!attributes.length || !(await resource.canViewAny(user))) continue;
            const q = resource.getEloquentQuery();
            // every word must be found in one of the attributes
            for (const word of term.split(/\s+/)) q.where((w: any) => attributes.forEach((a, i) => (i === 0 ? w.where(a, 'like', `%${word}%`) : w.orWhere(a, 'like', `%${word}%`))));
            const records = await q.limit(50).get();
            const results: SearchGroup['results'] = [];
            for (const record of records) {
                const url = resource.hasPage('edit') && (await resource.canEdit(user, record)) ? resource.getUrl('edit', { record }) : resource.hasPage('view') && (await resource.canView(user, record)) ? resource.getUrl('view', { record }) : null;
                if (url) results.push({ title: resource.getGlobalSearchResultTitle(record), url });
            }
            if (results.length) groups.push({ label: resource.getPluralModelLabel().toLowerCase(), results });
        }
        return groups;
    });
}
