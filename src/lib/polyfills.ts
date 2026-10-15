// iPhone Safari (through at least iOS 18) cannot `for await` over a ReadableStream, which
// pdf.js uses to read each page's text ("undefined is not a function (near '...t of e...')").
// Teach ReadableStream to be async-iterable. The same code is prepended to the pdf.js worker
// by scripts/copy-pdf-worker.mjs.
export function installStreamIterator(): void {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype as ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };
  if (typeof proto[Symbol.asyncIterator] === "function") return;
  async function* values(this: ReadableStream, opts?: { preventCancel?: boolean }) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!opts?.preventCancel) reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, "values", { value: values, configurable: true, writable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, configurable: true, writable: true });
}
