import fs from 'node:fs';
import path from 'node:path';
import { ulid } from '@/server/lib/ids';
import type { TicketMessage } from '@/server/models/TicketMessage';

const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', log: 'text/plain',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Ticket attachments: `storage/app/tickets/uploads/<ulid>.<ext>` + a `ticket_message_attachments` row each. */
export async function storeAttachments(message: TicketMessage, files: File[]): Promise<void> {
    for (const file of files) {
        if (!(file instanceof File) || file.size === 0) continue;
        const ext = path.extname(file.name).replace(/^\./, '');
        const newName = `${ulid()}${ext ? `.${ext}` : ''}`;
        const relative = `tickets/uploads/${newName}`;
        const full = path.join(process.cwd(), 'storage', 'app', relative);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, Buffer.from(await file.arrayBuffer()));
        await message.relation('attachments').create({
            path: relative,
            filename: file.name,
            mime_type: file.type || MIME[ext.toLowerCase()] || 'application/octet-stream',
            filesize: fs.statSync(full).size,
        });
    }
}
