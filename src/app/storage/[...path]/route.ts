import fs from 'node:fs';
import { publicDiskPath, mimeFor } from '@/server/storage';

export const dynamic = 'force-dynamic';

/** `/storage/*`: the files of the public disk (`public/storage` symlink in Laravel) */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path: segments } = await params;
    const full = publicDiskPath(segments.map(decodeURIComponent).join('/'));
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return new Response('Not Found', { status: 404 });
    const body = fs.readFileSync(full);
    const stat = fs.statSync(full);
    return new Response(body, {
        headers: {
            'Content-Type': mimeFor(full),
            'Content-Length': String(stat.size),
            'Last-Modified': stat.mtime.toUTCString(),
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
