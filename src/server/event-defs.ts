// AUTO-GENERATED from app/Events/**. One definition per PHP event class, keyed by the original FQCN.
import { defineEvent } from '@/server/events';
import type { Model } from '@/server/orm';
import type { GeneratePdfEvent } from '@/server/classes/GeneratePdfEvent';
import type { Cart } from '@/server/models/Cart';
import type { CartItem } from '@/server/models/CartItem';
import type { AdjustmentNote } from '@/server/models/AdjustmentNote';
import type { Invoice } from '@/server/models/Invoice';
import type { InvoiceItem } from '@/server/models/InvoiceItem';
import type { InvoiceTransaction } from '@/server/models/InvoiceTransaction';
import type { Notification } from '@/server/models/Notification';
import type { Order } from '@/server/models/Order';
import type { Property } from '@/server/models/Property';
import type { Service } from '@/server/models/Service';
import type { ServiceCancellation } from '@/server/models/ServiceCancellation';
import type { ServiceUpgrade } from '@/server/models/ServiceUpgrade';
import type { Setting } from '@/server/models/Setting';
import type { Ticket } from '@/server/models/Ticket';
import type { TicketMessage } from '@/server/models/TicketMessage';
import type { User } from '@/server/models/User';

export const Events = {
    Auth: {
        Login: defineEvent<{ user: User }>('App\\Events\\Auth\\Login'),
    },
    Cart: {
        Created: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Created'),
        Creating: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Creating'),
        Deleted: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Deleted'),
        Deleting: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Deleting'),
        Updated: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Updated'),
        Updating: defineEvent<{ cart: Cart }>('App\\Events\\Cart\\Updating'),
    },
    CartItem: {
        Created: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Created'),
        Creating: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Creating'),
        Deleted: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Deleted'),
        Deleting: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Deleting'),
        Updated: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Updated'),
        Updating: defineEvent<{ cartItem: CartItem }>('App\\Events\\CartItem\\Updating'),
    },
    AdjustmentNote: {
        Creating: defineEvent<{ adjustmentNote: AdjustmentNote }>('App\\Events\\AdjustmentNote\\Creating'),
    },
    Invoice: {
        Created: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Created'),
        Creating: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Creating'),
        Deleted: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Deleted'),
        Finalized: defineEvent<{ invoice: Invoice; sendEmail?: boolean }>('App\\Events\\Invoice\\Finalized'),
        GeneratePdf: defineEvent<GeneratePdfEvent>('App\\Events\\Invoice\\GeneratePdf'),
        Paid: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Paid'),
        Updated: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Updated'),
        Updating: defineEvent<{ invoice: Invoice }>('App\\Events\\Invoice\\Updating'),
    },
    InvoiceItem: {
        Created: defineEvent<{ invoiceItem: InvoiceItem }>('App\\Events\\InvoiceItem\\Created'),
        Creating: defineEvent<{ invoiceItem: InvoiceItem }>('App\\Events\\InvoiceItem\\Creating'),
        Deleted: defineEvent<{ invoiceItem: InvoiceItem }>('App\\Events\\InvoiceItem\\Deleted'),
        Updated: defineEvent<{ invoiceItem: InvoiceItem }>('App\\Events\\InvoiceItem\\Updated'),
        Updating: defineEvent<{ invoiceItem: InvoiceItem }>('App\\Events\\InvoiceItem\\Updating'),
    },
    InvoiceTransaction: {
        Created: defineEvent<{ invoiceTransaction: InvoiceTransaction }>('App\\Events\\InvoiceTransaction\\Created'),
        Creating: defineEvent<{ invoiceTransaction: InvoiceTransaction }>('App\\Events\\InvoiceTransaction\\Creating'),
        Deleted: defineEvent<{ invoiceTransaction: InvoiceTransaction }>('App\\Events\\InvoiceTransaction\\Deleted'),
        Updated: defineEvent<{ invoiceTransaction: InvoiceTransaction }>('App\\Events\\InvoiceTransaction\\Updated'),
        Updating: defineEvent<{ invoiceTransaction: InvoiceTransaction }>('App\\Events\\InvoiceTransaction\\Updating'),
    },
    Notification: {
        Created: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Created'),
        Creating: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Creating'),
        Deleted: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Deleted'),
        Deleting: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Deleting'),
        Updated: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Updated'),
        Updating: defineEvent<{ notification: Notification }>('App\\Events\\Notification\\Updating'),
    },
    Order: {
        Created: defineEvent<{ order: Order }>('App\\Events\\Order\\Created'),
        Creating: defineEvent<{ order: Order }>('App\\Events\\Order\\Creating'),
        Deleted: defineEvent<{ order: Order }>('App\\Events\\Order\\Deleted'),
        Finalized: defineEvent<{ order: Order; sendEmail?: boolean }>('App\\Events\\Order\\Finalized'),
        Updated: defineEvent<{ order: Order }>('App\\Events\\Order\\Updated'),
        Updating: defineEvent<{ order: Order }>('App\\Events\\Order\\Updating'),
    },
    Properties: {
        Updated: defineEvent<{ model: Model<any>; properties: any[] }>('App\\Events\\Properties\\Updated'),
    },
    Property: {
        Created: defineEvent<{ property: Property }>('App\\Events\\Property\\Created'),
        Deleted: defineEvent<{ property: Property }>('App\\Events\\Property\\Deleted'),
        Updated: defineEvent<{ property: Property }>('App\\Events\\Property\\Updated'),
    },
    Service: {
        Created: defineEvent<{ service: Service }>('App\\Events\\Service\\Created'),
        Deleted: defineEvent<{ service: Service }>('App\\Events\\Service\\Deleted'),
        Updated: defineEvent<{ service: Service }>('App\\Events\\Service\\Updated'),
    },
    ServiceCancellation: {
        Created: defineEvent<{ cancellation: ServiceCancellation }>('App\\Events\\ServiceCancellation\\Created'),
        Deleted: defineEvent<{ cancellation: ServiceCancellation }>('App\\Events\\ServiceCancellation\\Deleted'),
        Updated: defineEvent<{ cancellation: ServiceCancellation }>('App\\Events\\ServiceCancellation\\Updated'),
    },
    ServiceUpgrade: {
        Created: defineEvent<{ serviceUpgrade: ServiceUpgrade }>('App\\Events\\ServiceUpgrade\\Created'),
        Deleted: defineEvent<{ serviceUpgrade: ServiceUpgrade }>('App\\Events\\ServiceUpgrade\\Deleted'),
        Updated: defineEvent<{ serviceUpgrade: ServiceUpgrade }>('App\\Events\\ServiceUpgrade\\Updated'),
    },
    Setting: {
        Retrieved: defineEvent<Record<string, never>>('App\\Events\\Setting\\Retrieved'),
        Saved: defineEvent<{ setting: Setting }>('App\\Events\\Setting\\Saved'),
        Saving: defineEvent<Record<string, never>>('App\\Events\\Setting\\Saving'),
    },
    Ticket: {
        Created: defineEvent<{ ticket: Ticket }>('App\\Events\\Ticket\\Created'),
        Deleted: defineEvent<{ ticket: Ticket }>('App\\Events\\Ticket\\Deleted'),
        Updated: defineEvent<{ ticket: Ticket }>('App\\Events\\Ticket\\Updated'),
    },
    TicketMessage: {
        Created: defineEvent<{ ticketMessage: TicketMessage }>('App\\Events\\TicketMessage\\Created'),
        Deleted: defineEvent<{ ticketMessage: TicketMessage }>('App\\Events\\TicketMessage\\Deleted'),
        Updated: defineEvent<{ ticketMessage: TicketMessage }>('App\\Events\\TicketMessage\\Updated'),
    },
    User: {
        Created: defineEvent<{ user: User }>('App\\Events\\User\\Created'),
        Creating: defineEvent<{ user: User }>('App\\Events\\User\\Creating'),
        Updated: defineEvent<{ user: User }>('App\\Events\\User\\Updated'),
    },
} as const;
