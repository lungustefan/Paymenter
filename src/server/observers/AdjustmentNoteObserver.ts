import { Events } from '@/server/event-defs';
import { forward } from './_factory';

export const AdjustmentNoteObserver = forward(Events.AdjustmentNote, 'adjustmentNote', ['creating']);
