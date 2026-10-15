import { beforeAll, describe, expect, it } from "vitest";
import { allocate } from "@/lib/allocation";
import { activityDays, buildDailyReport, dailySummary, dayKey } from "@/lib/daily";
import { DEMO_WORK_DAY } from "@/lib/demo";
import { demoJob } from "@/lib/job";
import type { Job } from "@/lib/types";
import { pdfText } from "./pdfTextHelper";

let job: Job;
beforeAll(async () => {
  job = await demoJob();
});

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

describe("daily report", () => {
  it("knows which days have work (demo marks are dated 9/29/2026)", () => {
    expect(activityDays(job)).toEqual([DEMO_WORK_DAY]);
    expect(dayKey(job.marks[0].createdAt)).toBe(DEMO_WORK_DAY);
  });

  it("totals what was marked that day per code, next to job-to-date and master", () => {
    const s = dailySummary(job, allocate(job), DEMO_WORK_DAY);
    const row = (c: string) => s.codes.find((x) => x.code === c);
    expect(row("S10B")).toMatchObject({ today: 3825, jobToDate: 3825, master: 3825, remaining: 0 });
    expect(row("S16A")).toMatchObject({ today: 3600, jobToDate: 3600, master: 3600, remaining: 0 });
    expect(row("S63A")).toMatchObject({ today: 0, remaining: 5 });
    expect(row("S10A")).toMatchObject({ today: 1800, master: null });
  });

  it("splits the day by crew member and lists edits and overrides separately", () => {
    const j: Job = {
      ...job,
      marks: [
        ...job.marks,
        { ...job.marks[0], id: "x1", createdBy: "crew-2", createdAt: at("2026-09-30", "09:00"), items: [{ code: "S63A", qty: 2 }] },
        { ...job.marks[1], id: "x2", updatedBy: "crew-2", updatedAt: at("2026-09-30", "10:00") },
      ],
      overrides: [{ jobId: job.id, sheetId: job.sheets[1].id, code: "S63A", qty: 1, locked: true, createdBy: "demo-foreman", createdAt: at("2026-09-30", "11:00") }],
    };
    expect(activityDays(j)).toEqual(["2026-09-30", DEMO_WORK_DAY]);
    const s = dailySummary(j, allocate(j), "2026-09-30");
    expect(s.crews.map((c) => c.user)).toEqual(["crew-2"]);
    expect(s.crews[0].codes).toEqual([{ code: "S63A", qty: 2 }]);
    expect(s.edits.map((m) => m.id)).toEqual(["x2"]);
    expect(s.overrides).toHaveLength(1);
    expect(s.codes.find((c) => c.code === "S10B")!.today).toBe(0);
  });

  it("renders the daily PDF", async () => {
    const pdf = await buildDailyReport(job, allocate(job), { day: DEMO_WORK_DAY, preparedBy: "demo-foreman" });
    const text = (await pdfText(pdf, 1)) + " " + (await pdfText(pdf, 2).catch(() => ""));
    expect(text).toContain("Daily Report — 9/29/2026");
    expect(text).toContain("Crew: demo-foreman");
    expect(text).toMatch(/S10B.*Cut Pairs Dead.*3,825.*3,825.*3,825.*0/);
    expect(text).toContain("Not in master — not counted");
    expect(text).toContain("Splice 5: cut & cap main cable");
  });

  it("says so when nothing happened that day", async () => {
    const pdf = await buildDailyReport(job, allocate(job), { day: "2026-10-01", preparedBy: "x" });
    expect(await pdfText(pdf, 1)).toContain("No work recorded on this day.");
  });
});
