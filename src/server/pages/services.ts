import { notFound, redirect } from 'next/navigation';
import { once } from '@/server/request-store';
import { requireUser } from '@/server/page';
import { Service } from '@/server/models/Service';
import { ExtensionHelper } from '@/server/extensions/helper';
import type { User } from '@/server/models/User';

/** Route model binding + `can:view,service` for `/services/{service}` */
export function loadOwnedService(id: string): Promise<{ user: User; service: Service }> {
    return once(`pages:service:${id}`, async () => {
        const user = await requireUser({ verified: true });
        if (!/^\d+$/.test(id)) notFound();
        const service = await Service.find<Service>(Number(id));
        // `Gate::defaultDenialResponse(denyAsNotFound())`: other people's services do not exist
        if (!service || service.user_id !== user.id) notFound();
        return { user, service };
    });
}

export interface ServerAction {
    type: string;
    label: string;
    name?: string;
    function?: string;
    url?: string;
    target?: string;
    text?: string;
    [k: string]: unknown;
}

/** Livewire\Services\Show::mount - split the server extension's actions into buttons, views and text fields. */
export async function loadServiceActions(service: Service) {
    const buttons: ServerAction[] = [];
    const views: ServerAction[] = [];
    const fields: ServerAction[] = [];
    if (service.status === Service.STATUS_ACTIVE) {
        let actions: ServerAction[] = [];
        try {
            actions = (await ExtensionHelper.getActions(service)) ?? [];
        } catch {
            /* the extension may be unreachable */
        }
        for (const action of actions) {
            if (action.type === 'button') buttons.push(action);
            else if (action.type === 'view') views.push(action);
            else if (action.type === 'text') fields.push(action);
        }
    }
    return { buttons, views, fields };
}

export { redirect };
