import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** The `public` disk of Laravel's filesystem: `storage/app/public`, served at `/storage/*` (what `storage:link` exposed). */
export const publicDiskRoot = () => path.join(process.cwd(), 'storage', 'app', 'public');

export const MIME_TYPES: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', log: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const mimeFor = (file: string) => MIME_TYPES[path.extname(file).replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';

/** resolves a path of the public disk, refusing anything that escapes it */
export function publicDiskPath(relative: string): string | null {
    const root = publicDiskRoot();
    const full = path.resolve(root, relative.replace(/^\/+/, ''));
    return full === root || full.startsWith(root + path.sep) ? full : null;
}

export const publicFileExists = (relative: string) => {
    const full = publicDiskPath(relative);
    return !!full && fs.existsSync(full) && fs.statSync(full).isFile();
};

/** `$file->storePublicly($directory)` / `storeAs`: returns the path relative to the disk root */
export async function storePublicFile(file: File, directory = '', fileName?: string): Promise<string> {
    const ext = path.extname(file.name).replace(/^\./, '').toLowerCase();
    const name = fileName ?? `${randomBytes(20).toString('hex')}${ext ? `.${ext}` : ''}`;
    const relative = path.posix.join(directory.replace(/^\/+|\/+$/g, ''), name);
    const full = publicDiskPath(relative);
    if (!full) throw new Error('Invalid upload path');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(await file.arrayBuffer()));
    return relative;
}

export function deletePublicFile(relative: string): boolean {
    const full = publicDiskPath(relative);
    if (!full || !fs.existsSync(full)) return false;
    fs.rmSync(full, { force: true });
    return true;
}
