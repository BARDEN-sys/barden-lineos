import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/allocation";
import { demoJob } from "@/lib/job";
import { buildJobReport } from "@/lib/report";
import { pdfText } from "./pdfTextHelper";

describe("job report", () => {
  it("summarises units vs master, flags, sheets and crew marks", async () => {
    const job = await demoJob();
    const pdf = await buildJobReport(job, allocate(job), { date: "10/15/2026", preparedBy: "demo-foreman" });
    const text = (await pdfText(pdf, 1)) + " " + (await pdfText(pdf, 2).catch(() => ""));
    expect(text).toContain("Job Report — WO 4222352");
    expect(text).toContain("ready to export");
    expect(text).toMatch(/S10B.*Cut Pairs Dead.*3,825.*3,825.*0.*OK/);
    expect(text).toMatch(/S63A.*5.*0.*5.*UNMARKED/);
    expect(text).toContain("S10A — marked or on the print");
    expect(text).toContain("S10B 3,600 · S16A 3,600");
    expect(text).toContain("South Beach Golf");
    expect(text).toContain("BARDEN");
  });

  it("embeds a PNG logo when one is supplied", async () => {
    const job = await demoJob();
    // 1x1 PNG
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
      (ch) => ch.charCodeAt(0),
    );
    const plain = await buildJobReport(job, allocate(job), { date: "x", preparedBy: "y" });
    const withLogo = await buildJobReport(job, allocate(job), { date: "x", preparedBy: "y", logo: png });
    expect(withLogo.length).toBeGreaterThan(plain.length);
  });
});
