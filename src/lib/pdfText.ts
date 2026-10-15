import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { installStreamIterator } from "./polyfills";
import { mergeHeaders, parsePage, type ParsedPage, type TextItem } from "./printParse";
import type { JobHeader } from "./types";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Lazy-load pdf.js (legacy build: works on older phone browsers and in Node tests). */
export function loadPdfjs(): Promise<PdfjsModule> {
  installStreamIterator();
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    if (typeof window !== "undefined") m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  // pdf.js transfers (detaches) the buffer it is given, so always hand it a copy.
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

export type ExtractedPage = ParsedPage & { pageIndex: number; widthPt: number; heightPt: number };

export async function extractPrint(bytes: Uint8Array): Promise<{ header: JobHeader; pages: ExtractedPage[] }> {
  const doc = await openPdf(bytes);
  const pages: ExtractedPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const [x0, y0, x1, y1] = page.view;
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        items.push({ str: it.str, x: it.transform[4] - x0, y: it.transform[5] - y0, w: it.width, h: it.height });
      }
      pages.push({ ...parsePage(items, x1 - x0), pageIndex: n - 1, widthPt: x1 - x0, heightPt: y1 - y0 });
    }
  } finally {
    await doc.destroy();
  }
  return { header: mergeHeaders(pages), pages };
}
