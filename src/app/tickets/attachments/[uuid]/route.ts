import fs from 'node:fs';
import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { getCurrentUser } from '@/server/auth/session';
import { TicketMessageAttachment } from '@/server/models/TicketMessageAttachment';
import { url } from '@/server/routes';

/** `TicketAttachmentController::download` (`can:view,attachment`: ticket owner or `admin.tickets.view`) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
    await initRequest();
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(url(`/auth/guest?to=${encodeURIComponent(request.nextUrl.pathname)}`));

    const attachment = await TicketMessageAttachment.query().where('uuid', (await params).uuid).first();
    if (!attachment) return new NextResponse('Not Found', { status: 404 });
    const ticket = await (await (await attachment.rel('ticketMessage')).rel('ticket'));
    if (!(await user.hasPermission('admin.tickets.view')) && user.id !== ticket.user_id) return new NextResponse('Not Found', { status: 404 });
    if (!fs.existsSync(attachment.localPath)) return new NextResponse('Not Found', { status: 404 });

    const name = String(attachment.filename).replace(/["\r\n]/g, '');
    return new NextResponse(new Uint8Array(fs.readFileSync(attachment.localPath)), {
        headers: {
            'Content-Type': (attachment.mime_type as string) || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(String(attachment.filename))}`,
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
