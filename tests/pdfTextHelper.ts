import { openPdf } from "@/lib/pdfText";

/** All text on one page (1-based), joined with spaces. */
export async function pdfText(bytes: Uint8Array, pageNo: number): Promise<string> {
  const doc = await openPdf(bytes);
  try {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    return content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  } finally {
    await doc.destroy();
  }
}
