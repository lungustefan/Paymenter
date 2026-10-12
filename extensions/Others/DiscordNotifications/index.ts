import { Extension } from '@/server/extensions/Extension';
import type { ConfigDefinition } from '@/server/extensions/types';
import { ExtensionHelper } from '@/server/extensions/helper';
import { adminResources, adminResourceUrl, type AdminResourceInfo } from '@/server/admin/resources';
import { setting } from '@/server/config';
import { Events } from '@/server/event-defs';
import { listen } from '@/server/events';
import { Http } from '@/server/http';
import { Carbon } from '@/server/lib/carbon';
import { jsonEncode } from '@/server/lib/php';
import { Extension as ExtensionModel } from '@/server/models/Extension';
import type { Invoice } from '@/server/models/Invoice';
import type { Order } from '@/server/models/Order';
import type { Service } from '@/server/models/Service';
import type { User } from '@/server/models/User';
import type { Model } from '@/server/orm';

type Field = { name: string; value: string; inline: boolean };
type Bag = Record<string, any>;

const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const label = (s: string) => ucfirst(s.replaceAll('_', ' '));

/** PHP string conversion of a model attribute */
const phpString = (v: unknown): string => {
    if (v === null || v === undefined || v === false) return '';
    if (v === true) return '1';
    if (v instanceof Carbon) return v.toDateTimeString();
    return String(v);
};

const events = {
    'Order Created': Events.Order.Finalized,
    'Order Updated': Events.Order.Updated,
    'User Created': Events.User.Created,
    'User Updated': Events.User.Updated,
    'Invoice Created': Events.Invoice.Finalized,
    'Invoice Updated': Events.Invoice.Updated,
    'Invoice Paid': Events.Invoice.Paid,
    'Ticket Created': Events.Ticket.Created,
    'Ticket Updated': Events.Ticket.Updated,
    'Ticket Replied': Events.TicketMessage.Created,
    'Service Created': Events.Service.Created,
    'Service Updated': Events.Service.Updated,
} as const;

type EventType = keyof typeof events;

const resourceFor: Record<string, AdminResourceInfo> = {
    order_id: adminResources.OrderResource,
    invoice_id: adminResources.InvoiceResource,
    ticket_id: adminResources.TicketResource,
    service_id: adminResources.ServiceResource,
};

export default class DiscordNotifications extends Extension {
    static meta = {
        name: 'Discord Notifications',
        description: 'Send notifications to Discord for various events.',
        version: 'builtin',
        author: 'Paymenter',
        extensionId: 'unknown',
    };

    /**
     * Get all the configuration for the extension
     */
    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            {
                name: 'webhook_url',
                type: 'text',
                label: 'Webhook URL',
                required: true,
            },
            {
                name: 'ping_type',
                type: 'select',
                label: 'Ping Type',
                description: 'The type of user/role to ping',
                required: false,
                options: [
                    {
                        label: 'None',
                        value: 'none',
                    },
                    {
                        label: 'User',
                        value: 'user',
                    },
                    {
                        label: 'Role',
                        value: 'role',
                    },
                ],
            },
            {
                name: 'ping_id',
                type: 'text',
                label: 'Ping ID',
                description: 'The ID of the user/role to ping',
                required: false,
            },
            {
                name: 'events',
                type: 'select',
                multiple: true,
                label: 'Events',
                description: 'The events to send notifications for',
                required: true,
                database_type: 'array',
                options: Object.keys(events),
            },
        ];
    }

    boot() {
        // Registered once; what is sent is decided when the event happens (the settings may have changed since boot)
        if ((DiscordNotifications as any).listening) return;
        (DiscordNotifications as any).listening = true;

        for (const [eventType, event] of Object.entries(events) as [EventType, (typeof events)[EventType]][]) {
            listen(event as any, async (payload: Bag) => {
                const row = await ExtensionModel.query().where('extension', 'DiscordNotifications').where('enabled', true).first();
                if (!row) return;
                const discord = await ExtensionHelper.freshInstance<DiscordNotifications>('other', 'DiscordNotifications');
                if (!(discord.config<string[]>('events') ?? []).includes(eventType)) return;
                try {
                    await discord.sendNotification(payload, eventType);
                } catch (e) {
                    // Log the error
                    if (setting('debug', false)) {
                        throw e;
                    }
                }
            });
        }
    }

    private async updatedEvent(event: Bag, model: string): Promise<Field[]> {
        const record = event[model] as Model<any>;
        const changedFields: Field[] = [];
        changedFields.push({
            name: 'ID',
            value: model === 'user' ? await (record as User).name() : this.mapId(record.getKey(), model + '_id'),
            inline: true,
        });
        for (const [field, changed] of Object.entries(record.getChanges())) {
            let value: any = changed;
            if (!['created_at', 'updated_at', 'password', 'remember_token'].includes(field)) {
                if (typeof value !== 'string') {
                    value = jsonEncode(value);
                }
                // Replace _ with space and capitalize the first letter
                changedFields.push({
                    name: label(field),
                    value: phpString(record.getOriginal(field)) + ' -> ' + value,
                    inline: true,
                });
            }
            if (field === 'password') {
                changedFields.push({
                    name: 'Password',
                    value: '********',
                    inline: true,
                });
            }
        }

        return changedFields;
    }

    private async createdEvent(event: Bag, model: string, fields: string[] = []): Promise<Field[]> {
        if (fields.length === 0) {
            return [];
        }
        const record = event[model] as Bag;
        const efields: Field[] = [];
        for (const value of fields) {
            const name = label(value);
            let out: unknown;
            if (value.includes('_id') || value === 'id') {
                if (value === 'id') {
                    out = this.mapId(record[value], model + '_id');
                } else if (value === 'user_id') {
                    const user = (await record.rel('user')) as User;
                    out = '[User ' + (await user.name()) + '](' + adminResourceUrl(adminResources.UserResource, 'edit', record.user_id) + ')';
                } else {
                    out = this.mapId(record[value], value);
                }
            } else {
                out = record[value];
            }
            // Replace _ with space and capitalize the first letter
            const text = phpString(out);
            efields.push({
                name,
                value: Buffer.byteLength(text) > 1024 ? text.slice(0, 1021) + '...' : text,
                inline: true,
            });
        }

        return efields;
    }

    private mapId(id: unknown, name: string): string {
        // Check if the name is in the resources array
        const resource = resourceFor[name];
        if (resource) {
            return '[' + ucfirst(resource.modelLabel) + ' #' + id + '](' + adminResourceUrl(resource, 'edit', id as number) + ')';
        }

        // If no route name is found, return the ID
        return String(id);
    }

    async sendNotification(event: Bag, eventType: EventType) {
        const fieldBuilders: Record<EventType, (event: Bag) => Promise<Field[]>> = {
            'User Updated': (e) => this.updatedEvent(e, 'user'),
            'User Created': (e) => this.userCreated(e.user),
            'Order Created': (e) => this.orderCreated(e.order),
            'Order Updated': (e) => this.updatedEvent(e, 'order'),
            'Invoice Created': (e) => this.invoiceCreated(e.invoice),
            'Invoice Updated': (e) => this.updatedEvent(e, 'invoice'),
            'Invoice Paid': (e) => this.createdEvent(e, 'invoice', ['id']),
            'Ticket Created': (e) => this.createdEvent(e, 'ticket', ['id', 'user_id']),
            'Ticket Updated': (e) => this.updatedEvent(e, 'ticket'),
            'Ticket Replied': (e) => this.createdEvent(e, 'ticketMessage', ['ticket_id', 'message']),
            'Service Created': (e) => this.serviceCreated(e.service),
            'Service Updated': (e) => this.updatedEvent(e, 'service'),
        };

        // Check if the event type is valid
        if (!(eventType in fieldBuilders)) {
            return;
        }

        const fields = await fieldBuilders[eventType](event);
        const webhookUrl = this.config<string>('webhook_url') as string;
        const pingType = this.config<string>('ping_type');
        const pingId = this.config<string>('ping_id');

        const message: Bag = {
            content: ' ',
            embeds: [
                {
                    title: label(eventType),
                    description: `A new event has occurred: ${eventType}`,
                    fields,
                    color: 0x00ff00,
                    footer: {
                        text: 'Paymenter Notifications',
                    },
                    timestamp: Carbon.now().toIso8601String(),
                },
            ],
        };

        if (pingType !== 'none' && pingId) {
            message['content'] = pingType === 'user' ? `<@${pingId}>` : `<@&${pingId}>`;
        }

        // Send the notification to Discord
        (await Http.post(webhookUrl, message)).json();
    }

    private async userCreated(user: User): Promise<Field[]> {
        const fields: Field[] = [
            {
                name: 'ID',
                value: this.mapId(user.id, 'user_id'),
                inline: true,
            },
            {
                name: 'Name',
                value: await user.name(),
                inline: true,
            },
            {
                name: 'Email',
                value: user.email as string,
                inline: true,
            },
        ];

        // Add properties
        const properties = await user.relation('properties').get();
        for (const [key, value] of properties.entries()) {
            fields.push({
                name: label(String(key)),
                // (string) $model is the model's JSON
                value: jsonEncode(await value.toArray()),
                inline: true,
            });
        }

        return fields;
    }

    private async orderCreated(order: Order): Promise<Field[]> {
        const user = (await order.rel('user'))!;
        const fields: Field[] = [
            {
                name: 'ID',
                value: this.mapId(order.id, 'order_id'),
                inline: true,
            },
            {
                name: 'User',
                value: '[User ' + (await user.name()) + '](' + adminResourceUrl(adminResources.UserResource, 'edit', order.user_id as number) + ')',
                inline: true,
            },
            {
                name: 'Total',
                value: String(await order.formattedTotal()),
                inline: true,
            },
        ];

        for (const service of await order.rel('services')) {
            fields.push({
                name: (await (await service.rel('product'))!).name as string,
                value: '[Service #' + service.id + '](' + adminResourceUrl(adminResources.ServiceResource, 'edit', service.id as number) + ') (' + (await service.formattedPrice()) + ')',
                inline: true,
            });
        }

        return fields;
    }

    private async serviceCreated(service: Service): Promise<Field[]> {
        const user = (await service.rel('user'))!;
        const product = (await service.rel('product'))!;
        return [
            {
                name: 'ID',
                value: this.mapId(service.id, 'service_id'),
                inline: true,
            },
            {
                name: 'User',
                value: '[User ' + (await user.name()) + '](' + adminResourceUrl(adminResources.UserResource, 'edit', service.user_id as number) + ')',
                inline: true,
            },
            {
                name: 'Product',
                value: product.name as string,
                inline: true,
            },
            {
                name: 'Price',
                value: String(await service.formattedPrice()),
                inline: true,
            },
        ];
    }

    private async invoiceCreated(invoice: Invoice): Promise<Field[]> {
        const user = (await invoice.rel('user'))!;
        const fields: Field[] = [
            {
                name: 'ID',
                value: this.mapId(invoice.id, 'invoice_id'),
                inline: true,
            },
            {
                name: 'User',
                value: '[User ' + (await user.name()) + '](' + adminResourceUrl(adminResources.UserResource, 'edit', invoice.user_id as number) + ')',
                inline: true,
            },
            {
                name: 'Total',
                value: String(await invoice.formattedTotal()),
                inline: true,
            },
        ];

        for (const item of await invoice.rel('items')) {
            fields.push({
                name: item.description as string,
                value: item.quantity + ' x ' + (await item.formattedPrice()),
                inline: true,
            });
        }

        return fields;
    }
}
