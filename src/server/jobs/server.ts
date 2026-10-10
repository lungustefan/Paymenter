import { ExtensionHelper } from '@/server/extensions/helper';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { registerJob } from '@/server/queue';
import type { Service } from '@/server/models/Service';

/**
 * Port of App\Jobs\Server\{Create,Suspend,Unsuspend,Terminate,Upgrade}Job.
 * Each runs once (tries = 1) with a 120 second timeout. A missing server on the
 * product is silently ignored.
 */
interface Payload {
    service: Service;
    sendNotification?: boolean;
}

const NO_SERVER = 'No server assigned to this product';

async function tolerant<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
        return await fn();
    } catch (e: any) {
        if (e?.message !== NO_SERVER) throw e;
    }
}

const options = { tries: 1, timeout: 120 };

registerJob<Payload>('server.create', {
    ...options,
    async handle({ service, sendNotification = true }) {
        if (!service) return;
        const data = await tolerant(() => ExtensionHelper.createServer(service));
        if (sendNotification) {
            await NotificationHelper.serverCreatedNotification(await service.rel('user'), service, data && typeof data === 'object' ? data : {});
        }
    },
});

registerJob<Payload>('server.suspend', {
    ...options,
    async handle({ service, sendNotification = true }) {
        if (!service) return;
        const data = await tolerant(() => ExtensionHelper.suspendServer(service));
        if (sendNotification) {
            await NotificationHelper.serverSuspendedNotification(await service.rel('user'), service, data && typeof data === 'object' ? data : {});
        }
    },
});

registerJob<Payload>('server.unsuspend', {
    ...options,
    async handle({ service }) {
        if (!service) return;
        await tolerant(() => ExtensionHelper.unsuspendServer(service));
    },
});

registerJob<Payload>('server.terminate', {
    ...options,
    async handle({ service, sendNotification = true }) {
        if (!service) return;
        const data = await tolerant(() => ExtensionHelper.terminateServer(service));
        if (sendNotification) {
            await NotificationHelper.serverTerminatedNotification(await service.rel('user'), service, data && typeof data === 'object' ? data : {});
        }
    },
});

registerJob<Payload>('server.upgrade', {
    ...options,
    async handle({ service }) {
        if (!service) return;
        await tolerant(() => ExtensionHelper.upgradeServer(service));
    },
});
