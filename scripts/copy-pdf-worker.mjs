// Copies the pdf.js worker into /public so the browser can load it without bundler magic.
// iPhone Safari cannot `for await` over a ReadableStream, which pdf.js uses; the worker gets
// the same small patch as the page (src/lib/polyfills.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const STREAM_ITERATOR_PATCH = `(() => {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype;
  if (typeof proto[Symbol.asyncIterator] === "function") return;
  async function* values(opts) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!opts || !opts.preventCancel) reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, "values", { value: values, configurable: true, writable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, configurable: true, writable: true });
})();
`;

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const dest = path.join(process.cwd(), "public", "pdf.worker.min.mjs");
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, STREAM_ITERATOR_PATCH + readFileSync(src, "utf8"));
