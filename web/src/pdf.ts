// Her PDF, opened in the browser: the file never leaves her computer (Son, 29 Oct), so a 100 MB
// textbook works. We read the page count, whether the pages have text, each page's text, or a page
// drawn as a JPEG picture for a scanned book (read on the server, page by page).
import type { PDFDocumentProxy } from 'pdfjs-dist';

// pdf.js's legacy build runs in more browsers (Safari included) than its newest-browsers build, and the
// file's bytes are passed in directly (no blob link to fetch), so a PDF that is fine opens everywhere.
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true }).promise;
}
// the first bytes of a real PDF
export const looksLikePdf = async (file: File) => (await file.slice(0, 1024).text()).includes('%PDF-');

export async function pageText(doc: PDFDocumentProxy, n: number): Promise<string> {
  const page = await doc.getPage(n), tc = await page.getTextContent();
  let text = '';
  for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) if (typeof it.str === 'string') text += it.str + (it.hasEOL ? '\n' : '');
  page.cleanup();
  return text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Text or pictures: a few pages spread through the book; most of them with real text means a text PDF.
export async function hasText(doc: PDFDocumentProxy): Promise<boolean> {
  const n = doc.numPages, probe = [...new Set([1, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n])].filter((x) => x >= 1);
  let withText = 0;
  for (const p of probe) if ((await pageText(doc, p)).replace(/\s/g, '').length >= 20) withText++;
  return withText / probe.length > 0.5;
}

// One page as a JPEG about 1,240 px wide (enough for Muse Spark to read small print), under 1.4 MB.
// The long side is `long` px (A4 at 150 dpi): a portrait page is 1240 wide as before; a wide page (a
// sideways scan, two pages side by side) is drawn larger so its small text stays readable.
export async function pageJpeg(doc: PDFDocumentProxy, n: number, long = 1754): Promise<Blob> {
  const page = await doc.getPage(n), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: long / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  for (const q of [0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 1.4e6) return blob;
  }
  throw new Error('page too large');
}
