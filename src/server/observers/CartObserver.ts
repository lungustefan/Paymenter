import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const CartObserver = forward(Events.Cart, 'cart', ['creating', 'created', 'updating', 'updated', 'deleting', 'deleted']);
