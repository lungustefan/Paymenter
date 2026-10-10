import path from 'node:path';
import { Model, belongsTo } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { ticketMessageAttachments } from '@/server/db/schema';
import { uuid } from '@/server/lib/ids';
import type { Row } from './_types';
import { TicketMessage } from './TicketMessage';

export interface TicketMessageAttachment extends Row<typeof ticketMessageAttachments> {}

export class TicketMessageAttachment extends Model<{ ticketMessage: TicketMessage }> {
    static table = ticketMessageAttachments;
    static morphName = 'App\\Models\\TicketMessageAttachment';
    static fillable = ['path', 'filename', 'filesize', 'mime_type', 'ticket_message_id'];
    static relations: Record<string, RelationDef> = { ticketMessage: belongsTo(() => TicketMessage, 'ticket_message_id') };

    static override booted() {
        this.on('creating', (m: TicketMessageAttachment) => {
            m.uuid = uuid();
        });
    }

    /** `storage_path("app/{$this->path}")` */
    get localPath(): string {
        return path.join(process.cwd(), 'storage', 'app', this.path);
    }

    canPreview(): boolean {
        return this.mime_type.startsWith('image/');
    }
}
