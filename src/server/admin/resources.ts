import { baseUrl } from '@/server/routes';

/**
 * The parts of the admin panel's resources other code needs (`OrderResource::getUrl('edit', ...)`,
 * `getModelLabel()`): Filament derives the slug and label from the model name.
 */
export interface AdminResourceInfo {
    slug: string;
    /** `getModelLabel()` */
    modelLabel: string;
}

export const adminResources = {
    OrderResource: { slug: 'orders', modelLabel: 'order' },
    InvoiceResource: { slug: 'invoices', modelLabel: 'invoice' },
    TicketResource: { slug: 'tickets', modelLabel: 'ticket' },
    ServiceResource: { slug: 'services', modelLabel: 'service' },
    UserResource: { slug: 'users', modelLabel: 'user' },
} as const satisfies Record<string, AdminResourceInfo>;

/** `Resource::getUrl($name, ['record' => $id])` - the panel lives at `/admin`. */
export function adminResourceUrl(resource: AdminResourceInfo, page: 'index' | 'create' | 'edit' | 'view' = 'index', record?: string | number): string {
    const base = `${baseUrl()}/admin/${resource.slug}`;
    switch (page) {
        case 'create':
            return `${base}/create`;
        case 'edit':
            return `${base}/${record}/edit`;
        case 'view':
            return `${base}/${record}`;
        default:
            return base;
    }
}
