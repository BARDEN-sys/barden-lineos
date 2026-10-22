import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/allocation";
import { canAssign, exportKml, importRuns, isMismatch, kmlText, parseCallouts, parseKml, runMark, runTotals } from "@/lib/kml";
import type { Job, KmlRun } from "@/lib/types";

// Stand-in for the WO 4222528 Google Earth file (see the comment at the top of the fixture).
const KML = readFileSync(path.join(__dirname, "fixtures/wo-4222528-standin.kml"), "utf8");
let n = 0;
const id = (p: string) => `${p}-${++n}`;

describe("callout table", () => {
  it("reads HTML tables with a Total row", () => {
    const { callouts, total } = parseCallouts(
      "<table><tr><th>Callout</th><th>Feet</th></tr><tr><td>PPX callout 2</td><td>116</td></tr><tr><td>Total</td><td>1,116 ft</td></tr></table>",
    );
    expect(callouts).toEqual([{ label: "PPX callout 2", ft: 116 }]);
    expect(total).toBe(1116);
  });
  it("reads plain lines like 'PPX callout 2 = 116 ft' and 2: 116'", () => {
    expect(parseCallouts("PPX callout 2 = 116 ft<br/>Callout 3: 40'\nnotes: bore under drive").callouts).toEqual([
      { label: "PPX callout 2", ft: 116 },
      { label: "Callout 3", ft: 40 },
    ]);
  });
  it("skips pair counts and cable labels", () => {
    const { callouts } = parseCallouts("<table><tr><td>Cable</td><td>AKF 50 24</td></tr><tr><td>Pairs</td><td>50</td></tr><tr><td>1</td><td>200</td></tr></table>");
    expect(callouts).toEqual([{ label: "1", ft: 200 }]);
  });
});

describe("WO 4222528 import", () => {
  const runs = parseKml(KML);

  it("reads every LineString Placemark as a run, grouped by PPX / PPR folder", () => {
    expect(runs.map((r) => [r.group, r.name])).toEqual([
      ["PPX", "Sapphire"],
      ["PPX", "South Acacia"],
      ["PPX", "PPX Run 3"],
      ["PPX", "PPX Run 4"],
      ["PPR", "PPR Reference A"],
      ["PPR", "PPR Reference B"],
    ]);
    expect(runs[0].folders).toEqual(["WO 4222528", "PPX"]);
    expect(runs[0].callouts[1]).toEqual({ label: "PPX callout 2", ft: 116 });
  });

  it("uses the printed callout totals: PPX 3,216 over 4 runs, PPR 1,329 kept separate", () => {
    expect(runs.filter((r) => r.group === "PPX").map((r) => r.printedFt)).toEqual([894, 824, 874, 624]);
    const t = runTotals(runs);
    expect(t.PPX).toBe(3216);
    expect(t.counts.PPX).toBe(4);
    expect(t.PPR).toBe(1329);
    expect(t.combined).toBe(4545);
  });

  it("flags Sapphire and South Acacia (map length > 15% off the printed footage)", () => {
    expect(runs.filter((r) => r.mismatch).map((r) => r.name)).toEqual(["Sapphire", "South Acacia"]);
    const sapphire = runs[0];
    expect(sapphire.printedFt).toBe(894);
    expect(sapphire.mapFt).toBeGreaterThan(1200);
    expect(sapphire.mapFt).toBeLessThan(1240);
    expect(isMismatch(100, 115)).toBe(false);
    expect(isMismatch(100, 116)).toBe(true);
  });

  it("opens the same file zipped as .kmz", () => {
    const kmz = zipSync({ "doc.kml": strToU8(KML), "files/icon.png": new Uint8Array([1, 2, 3]) });
    expect(parseKml(kmlText(kmz)).map((r) => r.printedFt)).toEqual(runs.map((r) => r.printedFt));
  });
});

function job(): Job {
  const j: Job = {
    id: "job-1",
    header: { woNumber: "4222528", projectNumber: "", engineers: [] },
    pdfName: "",
    pdfBytes: null,
    sheets: [1, 2].map((i) => ({
      id: `s${i}`, jobId: "job-1", pageIndex: i - 1, label: String(i), widthPt: 792, heightPt: 612,
      streets: [], cableLabels: [], footages: [], tags: [], notes: [], codesFound: [],
    })),
    master: [{ code: "P10F", description: "Footage", estQty: 3000 }],
    glossary: [{ code: "P10F", description: "Footage", unitType: "FOOTAGE" }],
    marks: [],
    overrides: [],
    photos: [],
    daily: [],
    createdBy: "t",
    createdAt: "",
  };
  j.kmlRuns = importRuns(j, parseKml(KML), "wo.kml", "t", id);
  return j;
}

describe("assigning runs to sheets", () => {
  it("bills printed footage through the allocation engine, never over master", () => {
    const j = job();
    const ppx = j.kmlRuns!.filter((r) => r.group === "PPX");
    ppx.forEach((r, i) => j.marks.push(runMark(r, i < 2 ? "s1" : "s2", "P10F", "t", id("mark"))));
    const c = allocate(j).codes[0];
    expect(c.marked).toBe(3216);
    // Master 3,000 < 3,216 marked: split in proportion, capped at master.
    expect(c.total).toBe(3000);
    expect(c.sheets.map((s) => s.qty)).toEqual([Math.round((3000 * 1718) / 3216), 3000 - Math.round((3000 * 1718) / 3216)]);
    expect(c.status).toBe("ok");
  });

  it("refuses PPR runs, codes missing from the master, and non-footage codes", () => {
    const j = job();
    const ppr = j.kmlRuns!.find((r) => r.group === "PPR") as KmlRun;
    expect(canAssign(j, ppr, "P10F").ok).toBe(false);
    expect(canAssign(j, j.kmlRuns![0], "X99X").ok).toBe(false);
    expect(canAssign(j, j.kmlRuns![0], "P10F").ok).toBe(true);
    j.master.push({ code: "S10B", description: "Cut Pairs Dead", estQty: 50 });
    j.glossary.push({ code: "S10B", description: "Cut Pairs Dead", unitType: "PAIRS" });
    expect(canAssign(j, j.kmlRuns![0], "S10B").ok).toBe(false);
  });
});

describe("KML export", () => {
  it("writes one pink Placemark per marked run with the callout table and WO in the name", () => {
    const j = job();
    j.marks.push(runMark(j.kmlRuns![0], "s1", "P10F", "t", id("mark")));
    j.marks.push(runMark(j.kmlRuns![1], "s2", "P10F", "t", id("mark")));
    const out = exportKml(j);
    expect(out.match(/<Placemark>/g)).toHaveLength(2);
    expect(out).toContain("<name>WO 4222528 · Sapphire</name>");
    expect(out).toContain("<color>ff9948ec</color>");
    expect(out).toContain("<td>PPX callout 2</td><td align=\"right\">116</td>");

    // Round trip: Google Earth file back in gives the same runs and footage.
    const again = parseKml(out);
    expect(again.map((r) => [r.name, r.printedFt])).toEqual([
      ["WO 4222528 · Sapphire", 894],
      ["WO 4222528 · South Acacia", 824],
    ]);
    expect(again[0].mapFt).toBe(j.kmlRuns![0].mapFt);
    expect(again[0].callouts.map((c) => c.ft)).toEqual([230, 116, 300, 248]);
  });
});
