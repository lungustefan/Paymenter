import { decimalString } from '@/server/lib/php';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { setting } from '@/server/config';
import { t } from '@/server/i18n';
import { InvoiceTransactionStatus } from '@/server/enums';
import { GeneratePdfEvent } from './GeneratePdfEvent';
import type { Invoice } from '@/server/models/Invoice';

/** What `PDF::generateInvoice()` returns: a thin wrapper offering `output()`, `save()` and HTTP helpers. */
export interface InvoicePdf {
    output(): Promise<Buffer>;
    save(filePath: string): Promise<boolean>;
    download(name?: string): Promise<Response>;
    stream(name?: string): Promise<Response>;
}

class BufferPdf implements InvoicePdf {
    constructor(private producer: () => Promise<Buffer>, private fileName = 'invoice.pdf') {}
    private cached?: Buffer;
    async output() {
        return (this.cached ??= await this.producer());
    }
    async save(filePath: string) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, await this.output());
        return true;
    }
    async download(name?: string) {
        return new Response(new Uint8Array(await this.output()), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name ?? this.fileName}"` },
        });
    }
    async stream(name?: string) {
        return new Response(new Uint8Array(await this.output()), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name ?? this.fileName}"` },
        });
    }
}

export class PDF {
    static async generateInvoice(invoice: Invoice): Promise<InvoicePdf> {
        // Dispatch event to see if any extension wants to handle PDF generation
        const event = new GeneratePdfEvent(invoice);
        await dispatch(Events.Invoice.GeneratePdf, event as any);

        if (event.hasPdf()) {
            if (event.pdf) return event.pdf;
            if (event.pdfPath) {
                const p = event.pdfPath;
                return new BufferPdf(async () => fs.readFileSync(p), event.fileName ?? path.basename(p));
            }
            if (event.pdfContent !== null) {
                let content = event.pdfContent;
                // Decode base64 if it looks like base64
                if (typeof content === 'string') {
                    const isB64 = Buffer.from(content, 'base64').toString('base64') === content;
                    content = isB64 ? Buffer.from(content, 'base64') : Buffer.from(content);
                }
                const buf = content as Buffer;
                return new BufferPdf(async () => buf, event.fileName ?? 'invoice.pdf');
            }
        }
        return new BufferPdf(() => renderInvoice(invoice));
    }
}

const FONT = path.join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf');

function dejavu(file: string, fallback: string): string {
    const p = path.join(FONT, file);
    return fs.existsSync(p) ? p : fallback;
}

async function logoBuffer(): Promise<Buffer | null> {
    const logo = setting<string | null>('logo');
    if (!logo) return null;
    const file = path.join(process.cwd(), 'storage', 'app', 'public', logo);
    if (!fs.existsSync(file)) return null;
    try {
        const sharp = (await import('sharp')).default;
        return await sharp(file).png().toBuffer();
    } catch {
        return null;
    }
}

function fmtDate(d: { format(f: string): string } | null | undefined) {
    return d ? d.format('d/m/Y') : '';
}

/** Port of resources/views/pdf/invoice.blade.php */
async function renderInvoice(invoice: Invoice): Promise<Buffer> {
    const [items, transactions, total, userName, userProps, billTo, tax] = await Promise.all([
        invoice.rel('items'),
        invoice.rel('transactions'),
        invoice.formattedTotal(),
        invoice.userName(),
        invoice.userProperties(),
        invoice.billTo(),
        invoice.tax(),
    ]);
    const logo = await logoBuffer();
    const proforma = !invoice.number && setting('invoice_proforma', false);

    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: proforma ? t('invoices.proforma_invoice', { id: invoice.id }) : t('invoices.invoice', { id: invoice.number }) } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.registerFont('regular', dejavu('DejaVuSans.ttf', 'Helvetica'));
    doc.registerFont('bold', dejavu('DejaVuSans-Bold.ttf', 'Helvetica-Bold'));
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    doc.font('regular').fontSize(12).fillColor('#000');

    if (logo) {
        doc.image(logo, left, doc.y + 15, { height: 24 });
        doc.moveDown(4.5);
    }

    // Status
    doc.font('bold').fontSize(15).text(`${t('invoices.status')}:`, left, doc.y, { continued: true });
    const status = invoice.status ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) : '';
    doc.font('regular').fillColor(invoice.status === 'paid' ? 'green' : 'orange').text(` ${status}`);
    doc.fillColor('#000').moveDown(1.2);

    // Info (issued to / bill to)
    const infoTop = doc.y;
    doc.fontSize(10.5).font('bold').text(t('invoices.issued_to'), left, infoTop);
    doc.font('regular').text(String(userName));
    for (const v of Object.values(userProps ?? {})) doc.text(String(v));
    const leftEnd = doc.y;
    doc.font('bold').text(t('invoices.bill_to').toUpperCase(), left + width / 2, infoTop);
    doc.font('regular').text(String(billTo), left + width / 2, doc.y, { width: width / 2 });
    doc.y = Math.max(leftEnd, doc.y);

    doc.moveDown(1).fontSize(12);
    doc.text(`${proforma ? t('invoices.proforma_invoice_date') : t('invoices.invoice_date')}: `, left, doc.y, { continued: true });
    doc.font('bold').text(fmtDate(invoice.created_at));
    if (invoice.number) {
        doc.font('regular').text(`${t('invoices.invoice_no')}: `, { continued: true });
        doc.font('bold').text(String(invoice.number));
    }

    // Items table
    doc.moveDown(2.5);
    const cols = [width - 100 - 140 - 110, 100, 140, 110];
    const drawHeader = (labels: string[], widths: number[]) => {
        doc.font('regular').fontSize(9).fillColor('#999');
        let x = left;
        const y = doc.y;
        labels.forEach((label, i) => {
            doc.text(label.toUpperCase(), x, y, { width: widths[i], align: i === labels.length - 1 ? 'right' : 'left' });
            x += widths[i];
        });
        const bottom = doc.y + 6;
        doc.moveTo(left, bottom).lineTo(right, bottom).lineWidth(1.5).strokeColor('#ddd').stroke();
        doc.fillColor('#000').fontSize(10.5);
        doc.y = bottom + 8;
    };
    const drawRow = (values: string[], widths: number[]) => {
        const y = doc.y;
        let x = left;
        let maxY = y;
        values.forEach((v, i) => {
            doc.text(v, x, y, { width: widths[i] - 4, align: i === values.length - 1 ? 'right' : 'left' });
            maxY = Math.max(maxY, doc.y);
            x += widths[i];
        });
        doc.y = maxY + 8;
    };

    drawHeader([t('invoices.item'), t('invoices.quantity'), t('invoices.unit_price'), t('invoices.total')], cols);
    for (const item of items) {
        drawRow([String(item.description), String(item.quantity), String(await item.formattedPrice()), String(await item.formattedTotal())], cols);
    }

    // Totals
    doc.moveDown(1.5);
    const tx = right - 260;
    const row = (label: string, amount: string, topBorder = false, boldLabel = false) => {
        if (topBorder) doc.moveTo(tx, doc.y).lineTo(right, doc.y).lineWidth(1.5).strokeColor('#ddd').stroke(), (doc.y += 6);
        const y = doc.y;
        doc.font(boldLabel ? 'bold' : 'regular').fontSize(9).fillColor(boldLabel ? '#000' : '#666').text(label.toUpperCase(), tx, y, { width: 150 });
        doc.font('bold').fontSize(10.5).fillColor('#000').text(amount, tx + 150, y, { width: 110, align: 'right' });
        doc.y = Math.max(doc.y, y) + 6;
    };
    if (Number(total.tax) > 0) {
        row(t('invoices.subtotal'), total.format(total.price - Number(total.tax)));
        row(`${tax?.name} (${decimalString(tax?.rate)}%)`, total.formatted.tax);
        row(t('invoices.total'), String(total), true, true);
    } else {
        row(t('invoices.total'), String(total), true, true);
    }

    // Transactions
    const paid = transactions.filter((tr) => tr.status === InvoiceTransactionStatus.Succeeded);
    if (paid.length > 0) {
        doc.moveDown(3);
        const tcols = [width * 0.3, width * 0.2, width * 0.25, width * 0.25];
        drawHeader([t('invoices.transaction_id'), t('invoices.payment_date'), t('invoices.amount'), t('invoices.payment_method')], tcols);
        for (const tr of paid) {
            const gateway = await tr.rel('gateway');
            drawRow([String(tr.transaction_id ?? ''), fmtDate(tr.created_at), String(await tr.formattedAmount()), gateway ? gateway.name : ''], tcols);
        }
    }

    doc.end();
    return done;
}
