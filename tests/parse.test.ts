import { describe, expect, it } from "vitest";
import { parseMasterText } from "@/lib/masterParse";
import { parsePage, type TextItem } from "@/lib/printParse";

const t = (str: string, x: number, y: number): TextItem => ({ str, x, y, w: str.length * 5, h: 10 });

describe("parsePage", () => {
  const items = [
    t("SPLICER NOTE: CUT DEAD 50 PR AT PPX 14.", 28, 748),
    t("MAIN ST", 300, 450),
    t("AKF 50 24", 500, 430),
    t("449'", 500, 417),
    t("PPR 12", 80, 480),
    t("PPX 14", 790, 480),
    t("W.O. # 4222352", 900, 190),
    t("PROJECT # CR-26-0187", 900, 175),
    t("ENGINEER: J. SAMPLE / R. DEMO", 900, 160),
    t("SHEET 2", 900, 145),
    t("OF 6", 940, 145),
    t("LINE CREW NOTE: S10A LIVE CUT AT PPR 22", 28, 700),
    t("UNITS / ACCT CODES:", 900, 120),
  ];
  const p = parsePage(items, 1224);

  it("reads the title block", () => {
    expect(p.header).toEqual({ woNumber: "4222352", projectNumber: "CR-26-0187", engineers: ["J. SAMPLE", "R. DEMO"] });
    expect(p.label).toBe("2 of 6");
  });
  it("reads streets, cables, footage and pole tags", () => {
    expect(p.streets).toEqual(["MAIN ST"]);
    expect(p.cableLabels).toEqual(["AKF 50 24"]);
    expect(p.footages).toEqual([449]);
    expect(p.tags).toEqual(expect.arrayContaining(["PPR 12", "PPX 14", "PPR 22"]));
  });
  it("finds notes, unit codes and the units block", () => {
    expect(p.notes).toHaveLength(2);
    expect(p.codesFound).toEqual(["S10A"]);
    expect(p.unitsBlock).toMatchObject({ x: 900, y: 36 });
  });
});

describe("parsePage on real-print title blocks", () => {
  it("reads WO #, PROJECT NUMBER, KCI/FTR ENG and SHT", () => {
    const p = parsePage(
      [
        t("70330 WO #4222352", 1500, 300),
        t("KCI ENG: CHRIS SAMPLE PHONE:813-000-0000", 1500, 285),
        t("FTR ENG: SETH SAMPLE", 1500, 270),
        t("PROJECT NUMBER: 4222058", 1500, 255),
        t("SHT: 1 OF 1", 1500, 240),
      ],
      2000,
    );
    expect(p.header).toEqual({ woNumber: "4222352", projectNumber: "4222058", engineers: ["CHRIS SAMPLE", "SETH SAMPLE"] });
    expect(p.label).toBe("1 of 1");
  });
  it("reads cable labels like ASP 1800 26 and SS 101 24", () => {
    const p = parsePage([t("ASP 1800 26", 10, 100), t("SS 101 24", 10, 80), t("764'", 10, 70)], 2000);
    expect(p.cableLabels).toEqual(["ASP 1800 26", "SS 101 24"]);
    expect(p.footages).toEqual([764]);
  });
});

describe("parseMasterText", () => {
  it("parses OCR rows and fixes common OCR slips", () => {
    const text = [
      "Unit Code   Description               Est Qty",
      "S10B        Cut Pairs Dead            3,825",
      "S16A\tTest/Verify Pairs\t3600",
      "563A  Place Air Pressure Devices  5",
      "Total                                  7430",
    ].join("\n");
    expect(parseMasterText(text)).toEqual([
      { code: "S10B", description: "Cut Pairs Dead", estQty: 3825 },
      { code: "S16A", description: "Test/Verify Pairs", estQty: 3600 },
      { code: "S63A", description: "Place Air Pressure Devices", estQty: 5 },
    ]);
  });
  it("fixes O/I confusions inside the code digits", () => {
    expect(parseMasterText("S1OB Cut Pairs Dead 10")[0].code).toBe("S10B");
  });
});
