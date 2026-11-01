// Text out of a PDF, page by page (pdf.js, no system tools). Text PDFs only for now: a page with
// almost no text is reported as scanned, so the assigner knows rather than getting an empty book.
// pdf.js runs without a worker and without fonts or scripting: we only want the text layer.
// page: its place in the file; printed: the number printed on it, when a scan read one (Chi #45)
export interface PdfPage { page: number; text: string; printed?: number | null }

export async function readPdf(data: Buffer, maxPages = 400): Promise<{ pages: PdfPage[]; scanned: number; title: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: PdfPage[] = [];
    let scanned = 0;
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let text = '';
      for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof it.str !== 'string') continue;
        text += it.str + (it.hasEOL ? '\n' : '');
      }
      text = text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text.replace(/\s/g, '').length < 20) scanned++;
      pages.push({ page: i, text });
      page.cleanup();
    }
    const meta = await doc.getMetadata().catch(() => null);
    const title = String((meta?.info as { Title?: string } | undefined)?.Title || '').trim();
    return { pages, scanned, title };
  } finally {
    await task.destroy();
  }
}
