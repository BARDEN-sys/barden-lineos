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

// iOS Safari refuses canvases above ~16.7M pixels; stay well under it.
const MAX_CANVAS_PIXELS = 12_000_000;

/**
 * Renders one PDF page at a CSS width; height follows the page aspect ratio. `renderWidth` (default
 * `width`) sets the resolution, so a pinch can stretch the old bitmap until the sharper one is ready.
 */
export function PdfPageCanvas({
  bytes,
  pageIndex,
  width,
  renderWidth = width,
}: {
  bytes: Uint8Array;
  pageIndex: number;
  width: number;
  renderWidth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const doc = await docFor(bytes);
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled || !canvasRef.current || renderWidth <= 0) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let scale = (renderWidth / base.width) * dpr;
        scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)));
        const viewport = page.getViewport({ scale });
        // Draw off screen, then swap in one step so the page never flashes blank.
        const off = document.createElement("canvas");
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = page.render({ canvas: off, viewport });
        await task.promise;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
        off.width = off.height = 0;
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
  }, [bytes, pageIndex, renderWidth]);

  if (error) return <p className="p-4 text-sm text-red-700">Could not draw this page: {error}</p>;
  return (
    <canvas
      ref={canvasRef}
      className="block bg-white"
      style={{ width, height: aspect ? width * aspect : undefined }}
    />
  );
}
