import { NextResponse, type NextRequest } from 'next/server';
import { initRequest } from '@/server/page';
import { getCurrentUser } from '@/server/auth/session';
import { Invoice } from '@/server/models/Invoice';
import { PDF } from '@/server/classes/PDF';

/** `downloadPDF()` of Livewire\Invoices\Show: `invoice-<number>.pdf` */
export async function GET(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
    await initRequest();
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL(`/auth/guest?to=${encodeURIComponent(request.nextUrl.pathname)}`, request.nextUrl.origin));
    const invoice = await Invoice.resolveRouteBinding(decodeURIComponent((await params).invoice));
    if (!invoice || invoice.user_id !== user.id) return new NextResponse('Not Found', { status: 404 });
    const pdf = await PDF.generateInvoice(invoice);
    return pdf.download(`invoice-${invoice.number ?? invoice.id}.pdf`);
}
