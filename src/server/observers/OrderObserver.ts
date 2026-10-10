import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { afterResponse } from '@/server/terminating';
import type { Order } from '@/server/models/Order';

export const OrderObserver = {
    async creating(order: Order) {
        await dispatch(Events.Order.Creating, { order });
    },
    async created(order: Order) {
        await dispatch(Events.Order.Created, { order });
        const sendEmail = order.send_create_email;
        await afterResponse(async () => {
            await dispatch(Events.Order.Finalized, { order, sendEmail });
        });
    },
    async updating(order: Order) {
        await dispatch(Events.Order.Updating, { order });
    },
    async updated(order: Order) {
        await dispatch(Events.Order.Updated, { order });
    },
    async deleted(order: Order) {
        await dispatch(Events.Order.Deleted, { order });
    },
};
