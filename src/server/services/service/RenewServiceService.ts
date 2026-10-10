import { dispatchJob } from '@/server/queue';
import { Service } from '@/server/models/Service';

/** Renews a service after its invoice was paid (un-suspends / provisions it and moves the due date). */
export async function renewService(service: Service): Promise<void> {
    const product = (await service.rel('product'))!;
    if (await product.rel('server')) {
        if (service.status === Service.STATUS_SUSPENDED) {
            await dispatchJob('server.unsuspend', { service });
        } else if (service.status === Service.STATUS_PENDING) {
            await dispatchJob('server.create', { service });
        }
    }
    service.expires_at = await service.calculateNextDueDate();
    service.status = Service.STATUS_ACTIVE;
    await service.save();
}

export class RenewServiceService {
    handle(service: Service) {
        return renewService(service);
    }
}
