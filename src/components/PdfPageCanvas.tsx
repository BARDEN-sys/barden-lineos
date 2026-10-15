"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { openPdf } from "@/lib/pdfText";

// One open pdf.js document per loaded print, shared by every sheet view.
const docs = new WeakMap<Uint8Array, Promise<PDFDocumentProxy>>();
function docFor(bytes: Uint8Array) {
  let p = docs.get(bytes);
  if (!p) {
    p = openPdf(bytes);
    docs.set(bytes, p);
  }
  return p;
}

/** Renders one PDF page at a CSS width; height follows the page aspect ratio. */
export function PdfPageCanvas({ bytes, pageIndex, width }: { bytes: Uint8Array; pageIndex: number; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const doc = await docFor(bytes);
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled || !canvasRef.current || width <= 0) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${(width * base.height) / base.width}px`;
        task = page.render({ canvas, viewport });
        await task.promise;
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [bytes, pageIndex, width]);

  if (error) return <p className="p-4 text-sm text-red-700">Could not draw this page: {error}</p>;
  return <canvas ref={canvasRef} className="block bg-white" />;
}
