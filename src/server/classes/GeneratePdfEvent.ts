import type { Invoice } from '@/server/models/Invoice';

/** Port of App\Events\Invoice\GeneratePdf: extensions may supply the invoice PDF themselves. */
export class GeneratePdfEvent {
    pdf: any = null;
    pdfPath: string | null = null;
    pdfContent: Buffer | string | null = null;
    fileName: string | null = null;
    contentType = 'application/pdf';

    constructor(public invoice: Invoice) {}

    setPdfFromPath(path: string, fileName?: string | null) {
        this.pdfPath = path;
        this.fileName = fileName ?? path.split('/').pop() ?? null;
    }

    setPdfFromContent(content: Buffer | string, fileName?: string | null) {
        this.pdfContent = content;
        this.fileName = fileName ?? 'invoice.pdf';
    }

    setPdf(pdf: any) {
        this.pdf = pdf;
    }

    hasPdf(): boolean {
        return this.pdf !== null || this.pdfPath !== null || this.pdfContent !== null;
    }
}
