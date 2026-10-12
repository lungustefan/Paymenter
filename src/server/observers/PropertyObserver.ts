import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const PropertyObserver = forward(Events.Property, 'property', ['created', 'updated', 'deleted']);
