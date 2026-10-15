import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDemoPdf } from "@/lib/demo";
import { installStreamIterator } from "@/lib/polyfills";
import { extractPrint } from "@/lib/pdfText";

// iPhone Safari has no ReadableStream async iterator; pdf.js needs one to read page text.
describe("print reading without ReadableStream async iteration (iPhone Safari)", () => {
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  const saved = { iter: proto[Symbol.asyncIterator], values: proto.values };
  beforeAll(() => {
    delete proto[Symbol.asyncIterator];
    delete proto.values;
  });
  afterAll(() => {
    proto[Symbol.asyncIterator] = saved.iter;
    proto.values = saved.values;
  });

  it("is missing before the patch", () => {
    expect(proto[Symbol.asyncIterator]).toBeUndefined();
  });

  it("reads the print once the patch is installed", async () => {
    installStreamIterator();
    expect(typeof proto[Symbol.asyncIterator]).toBe("function");
    const { header, pages } = await extractPrint(await buildDemoPdf());
    expect(header.woNumber).toBe("4222352");
    expect(pages).toHaveLength(5);
    expect(pages[1].cableLabels).toEqual(["AKF 50 24"]);
  });
});
