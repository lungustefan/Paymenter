import { Events } from '@/server/event-defs';
import { dispatch } from '@/server/events';
import type { AdjustmentNote } from '@/server/models/AdjustmentNote';

/** credit notes are negative amounts, debit notes positive ones: the type always follows the sign */
function syncType(note: AdjustmentNote) {
    const amount = Number(note.amount);
    if (amount < 0) note.type = 'credit';
    else if (amount > 0) note.type = 'debit';
}

export const AdjustmentNoteObserver = {
    async creating(adjustmentNote: AdjustmentNote) {
        syncType(adjustmentNote);
        await dispatch(Events.AdjustmentNote.Creating, { adjustmentNote });
    },
    updating(adjustmentNote: AdjustmentNote) {
        if (adjustmentNote.isDirty('amount')) syncType(adjustmentNote);
    },
};
