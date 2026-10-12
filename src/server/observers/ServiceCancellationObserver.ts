import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const ServiceCancellationObserver = forward(Events.ServiceCancellation, 'cancellation', ['created', 'updated', 'deleted']);
