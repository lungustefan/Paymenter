import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const CartItemObserver = forward(Events.CartItem, 'cartItem', ['creating', 'created', 'updating', 'updated', 'deleting', 'deleted']);
