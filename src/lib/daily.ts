import type { AllocationResult } from "./allocation";
import { AMBER, BLUE, Cursor, drawPhotos, fmt, GREEN, M, MUTED, RED, sheetLabel, startReport } from "./report";
import { byTaskCode } from "./billing";
import { dayKey, dayLabel } from "./dates";
import type { Job, Mark, Override, Photo } from "./types";

export { dayKey, dayLabel };

// Daily report: what was done on one day, by crew member, against job-to-date and master.
// Work is counted on the day a mark was created; later edits show under "Changes".

/** Days with any crew activity, newest first. */
export function activityDays(job: Pick<Job, "marks" | "overrides" | "photos"> & Partial<Pick<Job, "daily">>): string[] {
  const days = new Set<string>();
  for (const m of job.marks) {
    days.add(dayKey(m.createdAt));
    if (m.updatedAt) days.add(dayKey(m.updatedAt));
  }
  for (const o of job.overrides) days.add(dayKey(o.createdAt));
  for (const p of job.photos) days.add(dayKey(p.takenAt));
  for (const e of job.daily ?? []) days.add(e.day);
  days.delete("");
  return [...days].sort().reverse();
}

export type CrewDay = {
  user: string;
  marks: Mark[];
  codes: { code: string; qty: number }[];
  runFt: number;
  removals: number;
  photos: number;
  first: string;
  last: string;
};

export type DailySummary = {
  day: string;
  codes: {
    code: string;
    description: string;
    today: number;
    jobToDate: number;
    master: number | null;
    remaining: number | null;
  }[];
  crews: CrewDay[];
  edits: Mark[];
  overrides: Override[];
  photos: Photo[];
};

function addQty(list: { code: string; qty: number }[], code: string, qty: number) {
  const row = list.find((r) => r.code === code);
  if (row) row.qty += qty;
  else list.push({ code, qty });
}

export function dailySummary(job: Job, result: AllocationResult, day: string): DailySummary {
  const marks = job.marks.filter((m) => dayKey(m.createdAt) === day);
  const edits = job.marks.filter((m) => m.updatedAt && dayKey(m.updatedAt) === day && dayKey(m.createdAt) !== day);
  const overrides = job.overrides.filter((o) => dayKey(o.createdAt) === day);
  const photos = job.photos.filter((p) => dayKey(p.takenAt) === day);

  const today: { code: string; qty: number }[] = [];
  for (const m of marks) for (const it of m.items) addQty(today, it.code, it.qty);
  const masterCodes = job.master.map((m) => m.code);
  const codes = [...masterCodes, ...today.map((t) => t.code).filter((c) => !masterCodes.includes(c))].map((code) => {
    const alloc = result.codes.find((c) => c.code === code);
    return {
      code,
      description: alloc?.description ?? job.glossary.find((g) => g.code === code)?.description ?? "",
      today: today.find((t) => t.code === code)?.qty ?? 0,
      jobToDate: alloc?.total ?? 0,
      master: alloc ? alloc.master : null,
      remaining: alloc ? alloc.remaining : null,
    };
  });

  const users = new Set<string>([...marks.map((m) => m.createdBy), ...photos.map((p) => p.createdBy)]);
  const crews: CrewDay[] = [...users].sort().map((user) => {
    const mine = marks.filter((m) => m.createdBy === user).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const myPhotos = photos.filter((p) => p.createdBy === user);
    const c: { code: string; qty: number }[] = [];
    for (const m of mine) for (const it of m.items) addQty(c, it.code, it.qty);
    const times = [...mine.map((m) => m.createdAt), ...myPhotos.map((p) => p.takenAt)].sort();
    return {
      user,
      marks: mine,
      codes: c,
      runFt: mine.filter((m) => m.kind === "run").reduce((a, m) => a + (m.lengthFt ?? 0), 0),
      removals: mine.filter((m) => m.kind === "spot" && !m.items.length).length,
      photos: myPhotos.length,
      first: times[0] ?? "",
      last: times[times.length - 1] ?? "",
    };
  });

  return { day, codes, crews, edits, overrides, photos };
}

const time = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

function markCodes(m: Mark) {
  if (m.items.length) return m.items.map((i) => `${i.code} ${fmt(i.qty)}`).join(", ");
  return m.kind === "run" ? `Run ${m.lengthFt ?? "?"}'` : "Removal";
}

export async function buildDailyReport(
  job: Job,
  result: AllocationResult,
  opts: { day: string; preparedBy: string; logo?: Uint8Array },
): Promise<Uint8Array> {
  const s = dailySummary(job, result, opts.day);
  const wo = job.header.woNumber || "—";
  const date = dayLabel(opts.day);
  const label = sheetLabel(job);
  const { doc, c } = await startReport(
    job,
    `Daily Report — ${date}`,
    `BARDEN LineOS · WO ${wo} daily report · ${date}`,
    [
      ["WO #", wo],
      ["Project #", job.header.projectNumber || "—"],
      ["Work date", date],
      ["Crew on job", s.crews.map((x) => x.user).join(", ") || "—"],
      ["Prepared by", opts.preparedBy],
    ],
    opts.logo,
  );

  const anything = s.crews.length || s.edits.length || s.overrides.length || job.daily.some((e) => e.day === opts.day);
  if (!anything) c.text("No work recorded on this day.", { bold: true, color: MUTED });

  // Units: today vs job-to-date vs master
  c.heading("Units");
  const ux = [M, M + 55, M + 240, M + 305, M + 375, M + 440];
  c.row(["Code", "Description", "Today", "Job to date", "Master", "Remaining"], ux, { bold: true, align: ["l", "l", "r", "r", "r", "r"] });
  for (const u of s.codes) {
    const notInMaster = u.master === null;
    c.row(
      [u.code, notInMaster ? "Not in master — not counted" : u.description, fmt(u.today), notInMaster ? "—" : fmt(u.jobToDate), notInMaster ? "—" : fmt(u.master!), notInMaster ? "—" : fmt(u.remaining!)],
      ux,
      {
        align: ["l", "l", "r", "r", "r", "r"],
        colors: [undefined, notInMaster ? AMBER : undefined, u.today ? BLUE : MUTED, undefined, undefined, (u.remaining ?? 0) < 0 ? RED : u.remaining === 0 ? GREEN : undefined],
      },
    );
  }
  c.text("Today = quantities marked today. Job to date = allocated across all sheets (never above master).", { size: 8, color: MUTED });

  // One section per crew member
  for (const crew of s.crews) {
    c.heading(`Crew: ${crew.user}`);
    const facts = [
      `${crew.marks.length} marks`,
      crew.runFt ? `${fmt(crew.runFt)} ft of runs` : "",
      crew.removals ? `${crew.removals} removals` : "",
      crew.photos ? `${crew.photos} photos` : "",
      crew.first ? `${time(crew.first)} – ${time(crew.last)}` : "",
    ].filter(Boolean);
    c.text(facts.join(" · "), { size: 9, color: MUTED });
    if (crew.codes.length) c.text(crew.codes.map((x) => `${x.code} ${fmt(x.qty)}`).join("   "), { bold: true, color: BLUE, gap: 2 });
    if (!crew.marks.length) continue;
    const mx = [M, M + 50, M + 110, M + 330];
    c.row(["Time", "Sheet", "Codes", "Note"], mx, { bold: true });
    const shown = crew.marks.filter((m) => m.items.length || m.kind === "run" || (m.note && m.note !== "Removal"));
    for (const m of shown) c.row([time(m.createdAt), label(m.sheetId), markCodes(m), m.note ?? ""], mx);
    const hidden = crew.marks.length - shown.length;
    if (hidden) c.text(`Plus ${hidden} removal spot(s) without unit codes.`, { size: 8, color: MUTED });
  }

  // Billing: the day's input rows with task codes, then totals by task code.
  const billing = job.daily.filter((e) => e.day === opts.day);
  if (billing.length) {
    c.heading("Billing (daily input)");
    const bx = [M, M + 85, M + 145, M + 195, M + 255, M + 445];
    c.row(["Task code", "Unit", "Sheet", "Qty", "Note", "By"], bx, { bold: true, align: ["l", "l", "l", "r", "l", "l"] });
    for (const e of billing) {
      c.row([e.taskCode || "(none)", e.unitCode, label(e.sheetId), fmt(e.qty), e.note ?? "", e.updatedBy ?? e.createdBy], bx, {
        align: ["l", "l", "l", "r", "l", "l"],
        colors: [e.taskCode ? BLUE : AMBER],
      });
    }
    c.y -= 6;
    c.text("Totals by task code", { bold: true, size: 10 });
    const tx = [M, M + 120, M + 200];
    for (const t of byTaskCode(billing)) c.row([t.taskCode || "(none)", t.unitCode, fmt(t.qty)], tx, { align: ["l", "l", "r"], colors: [t.taskCode ? BLUE : AMBER] });
    const missing = billing.filter((e) => !e.taskCode.trim()).length;
    if (missing) c.text(`${missing} row(s) have no task code.`, { bold: true, color: AMBER });
  }

  if (s.edits.length || s.overrides.length) {
    c.heading("Changes today");
    const ex = [M, M + 50, M + 110, M + 330, M + 430];
    c.row(["Time", "Sheet", "Now", "Change", "By"], ex, { bold: true });
    for (const m of s.edits) c.row([time(m.updatedAt!), label(m.sheetId), markCodes(m), "Mark edited", m.updatedBy ?? m.createdBy], ex);
    for (const o of s.overrides) c.row([time(o.createdAt), label(o.sheetId), `${o.code} ${fmt(o.qty)}`, "Locked override", o.createdBy], ex, { colors: [undefined, undefined, BLUE] });
  }

  if (!result.canExport) {
    c.heading("Over master");
    for (const b of result.blockers) c.text(b, { bold: true, color: RED });
  }

  await drawPhotos(c as Cursor, s.photos, label, "Photos today");
  return doc.save();
}
