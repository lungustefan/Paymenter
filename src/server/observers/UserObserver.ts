import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const UserObserver = forward(Events.User, 'user', ['creating', 'created', 'updated']);
