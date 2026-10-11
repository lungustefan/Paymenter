import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const ServiceObserver = forward(Events.Service, 'service', ['created', 'updated', 'deleted']);
