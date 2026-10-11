import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const ServiceUpgradeObserver = forward(Events.ServiceUpgrade, 'serviceUpgrade', ['created', 'updated', 'deleted']);
