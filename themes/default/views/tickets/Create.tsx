import { setting } from '@/server/config';
import { getCurrentUser } from '@/server/auth/session';
import { ucfirst } from '@/server/lib/php';
import type { Service } from '@/server/models/Service';
import { CreateTicketForm } from './TicketClient';

/** Port of views/tickets/create.blade.php */
export default async function Create() {
    const user = (await getCurrentUser())!;
    const departments = Object.values((setting<any>('ticket_departments', []) ?? {}) as Record<string, string>);
    const services = await user.relation<Service>('services').orderBy('id', 'desc').get();
    const options = await Promise.all(
        services.map(async (service) => {
            const product = (await service.rel('product'))!;
            return { id: service.id as number, label: `${product.name} (${await service.displayLabel()}) (${ucfirst(service.status as string)})${service.expires_at ? ` - ${service.expires_at.format('Y-m-d')}` : ''}` };
        }),
    );
    return <CreateTicketForm departments={departments} services={options} />;
}
