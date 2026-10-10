import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const NotificationObserver = forward(Events.Notification, 'notification', ['creating', 'created', 'updating', 'updated', 'deleting', 'deleted']);
