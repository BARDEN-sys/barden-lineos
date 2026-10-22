import { beforeAll, describe, expect, it } from "vitest";
import {
  applyRemote,
  dailyRow,
  emptySyncState,
  friendlyError,
  isEmptyPlan,
  isMissingTable,
  kmlRunRow,
  markRow,
  overrideRow,
  photoRow,
  planPush,
  jobRow,
  type RemoteRows,
} from "@/lib/cloudRows";
import { demoJob } from "@/lib/job";
import type { Job, KmlRun, Photo } from "@/lib/types";

let base: Job;
beforeAll(async () => {
  base = await demoJob();
});

const shared = (role: "foreman" | "crew" = "foreman"): Job => ({ ...base, cloud: { crewId: "crew-1", role } });

/** What the server would hold after accepting everything the phone sent. */
function serverEcho(job: Job, extra: Partial<RemoteRows> = {}): RemoteRows {
  const user = "u-1";
  return {
    job: jobRow(job),
    marks: job.marks.map((m) => ({ ...markRow(m), created_by: user, updated_by: user, updated_at: m.createdAt })),
    overrides: job.overrides.map((o) => ({ ...overrideRow(o), created_by: user, updated_by: user })),
    daily: job.daily.map((e) => ({ ...dailyRow(e), created_by: user, updated_by: user, updated_at: e.createdAt })),
    photos: job.photos.map((p) => ({ ...photoRow(p), created_by: user })),
    kmlRuns: (job.kmlRuns ?? []).map((r) => ({ ...kmlRunRow(r), created_by: user, updated_by: user })),
    names: { [user]: "Barry" },
    ...extra,
  };
}

describe("planPush", () => {
  it("sends everything the first time a project is shared", () => {
    const plan = planPush(shared(), emptySyncState());
    expect(plan.job).not.toBeNull();
    expect(plan.marks).toHaveLength(base.marks.length);
    expect(plan.markDeletes).toEqual([]);
  });

  it("sends nothing right after a sync", () => {
    const job = shared();
    const { job: after, state } = applyRemote(job, serverEcho(job), new Map());
    expect(isEmptyPlan(planPush(after, state))).toBe(true);
  });

  it("sends only what changed: an edited mark, a new daily row, a deleted mark", () => {
    const job = shared();
    const { job: synced, state } = applyRemote(job, serverEcho(job), new Map());
    const edited: Job = {
      ...synced,
      marks: synced.marks.slice(1).map((m, i) => (i === 0 ? { ...m, note: "changed" } : m)),
      daily: [
        { id: "d1", jobId: job.id, day: "2026-10-15", sheetId: null, unitCode: "S10B", taskCode: "TC", qty: 5, createdBy: "x", createdAt: "2026-10-15T12:00:00Z" },
      ],
    };
    const plan = planPush(edited, state);
    expect(plan.job).toBeNull();
    expect(plan.marks.map((m) => m.id)).toEqual([synced.marks[1].id]);
    expect(plan.markDeletes).toEqual([synced.marks[0].id]);
    expect(plan.daily.map((d) => d.id)).toEqual(["d1"]);
  });

  it("a crew member never sends project changes (master, task codes)", () => {
    const job = shared("crew");
    job.master = job.master.map((m) => ({ ...m, estQty: 99999 }));
    expect(planPush(job, emptySyncState()).job).toBeNull();
  });

  it("uploads new photos once", () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const photo: Photo = { id: "p1", jobId: base.id, sheetId: null, kind: "field", blob, url: "blob:x", width: 1, height: 1, takenAt: "t", createdBy: "u" };
    const job = { ...shared(), photos: [photo] };
    expect(planPush(job, emptySyncState()).newPhotos.map((p) => p.id)).toEqual(["p1"]);
    const { state } = applyRemote(job, serverEcho(job), new Map());
    expect(planPush(job, state).newPhotos).toEqual([]);
  });
});

describe("applyRemote", () => {
  it("takes the server's numbers and names, and drops what the server rejected or deleted", () => {
    const job = shared();
    const remote = serverEcho(job);
    remote.marks[0] = { ...remote.marks[0], deleted: true };
    remote.marks[1] = { ...remote.marks[1], created_by: "u-2" };
    remote.names["u-2"] = "Carl";
    const local = { ...job, daily: [{ id: "rejected", jobId: job.id, day: "2026-10-15", sheetId: null, unitCode: "S10B", taskCode: "", qty: 9999, createdBy: "x", createdAt: "t" }] };
    const { job: merged } = applyRemote(local, remote, new Map());
    expect(merged.marks).toHaveLength(job.marks.length - 1);
    expect(merged.marks[0].createdBy).toBe("Carl");
    expect(merged.daily).toEqual([]);
    expect(merged.pdfBytes).toBe(job.pdfBytes);
    expect(merged.cloud).toEqual(job.cloud);
  });

  it("only shows 'edited' when a row was changed after it was made", () => {
    const job = shared();
    const remote = serverEcho(job);
    remote.marks[0] = { ...remote.marks[0], updated_at: new Date(Date.parse(remote.marks[0].created_at) + 60_000).toISOString(), updated_by: "u-1" };
    const { job: merged } = applyRemote(job, remote, new Map());
    expect(merged.marks[0].updatedBy).toBe("Barry");
    expect(merged.marks[1].updatedBy).toBeUndefined();
  });
});

describe("friendlyError", () => {
  it("turns server rule errors into plain words", () => {
    expect(friendlyError("LINEOS_OVER_MASTER: S10B billed would be 3850 vs master 3825. Already billed by: Carl. Max on this row is 25.")).toBe(
      "S10B billed would be 3850 vs master 3825. Already billed by: Carl. Max on this row is 25.",
    );
    expect(friendlyError("new row violates row-level security policy for table \"jobs\"")).toBe("Only the foreman can change that.");
  });
});

import { tokenFromLink } from "@/components/AuthProvider";
describe("tokenFromLink", () => {
  it("reads the one-time token from a Supabase sign-in link", () => {
    expect(
      tokenFromLink("https://klvkehiasgkteprmxihs.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https://barden-lineos.vercel.app"),
    ).toEqual({ hash: "abc123", type: "magiclink" });
    expect(tokenFromLink("https://x.supabase.co/auth/v1/verify?token=zz&type=signup")).toEqual({ hash: "zz", type: "signup" });
    expect(tokenFromLink("not a link")).toBeNull();
  });
});

describe("Google Earth runs on a shared project", () => {
  const run = (id: string, extra: Partial<KmlRun> = {}): KmlRun => ({
    id,
    jobId: base.id,
    name: `Run ${id}`,
    folder: "WO / PPX",
    group: "PPX",
    lines: [[[-82.46, 27.95], [-82.459, 27.95]]],
    callouts: [{ label: "PPX callout 1", ft: 300 }],
    printedFt: 300,
    mapFt: 320,
    mismatch: false,
    sourceFile: "wo.kml",
    createdBy: "Barry",
    createdAt: "2026-10-22T12:00:00Z",
    ...extra,
  });

  it("uploads imported runs, then sends nothing until one changes", () => {
    const job: Job = { ...shared(), kmlRuns: [run("k1"), run("k2", { group: "PPR" })] };
    const first = planPush(job, emptySyncState());
    expect(first.kmlRuns.map((r) => r.id)).toEqual(["k1", "k2"]);
    expect(first.kmlRuns[1].data.group).toBe("PPR");

    const { job: synced, state } = applyRemote(job, serverEcho(job), new Map());
    expect(synced.kmlRuns!.map((r) => [r.id, r.createdBy])).toEqual([["k1", "Barry"], ["k2", "Barry"]]);
    expect(isEmptyPlan(planPush(synced, state))).toBe(true);

    // A crew member signs off the printed footage on one run and removes the other.
    const signed: Job = { ...synced, kmlRuns: [{ ...synced.kmlRuns![0], confirmedBy: "Jo", confirmedAt: "2026-10-22T13:00:00Z" }] };
    const plan = planPush(signed, state);
    expect(plan.kmlRuns.map((r) => [r.id, r.data.confirmedBy])).toEqual([["k1", "Jo"]]);
    expect(plan.kmlRunDeletes).toEqual(["k2"]);
  });

  it("takes the crew's runs from the server (another phone imported them)", () => {
    const job = shared();
    const other: Job = { ...job, kmlRuns: [run("k9")] };
    const { job: after } = applyRemote(job, serverEcho(other), new Map());
    expect(after.kmlRuns!.map((r) => r.id)).toEqual(["k9"]);
  });

  it("keeps the phone's runs when the server has no kml_runs table yet", () => {
    const job: Job = { ...shared(), kmlRuns: [run("k1")] };
    const { job: after, state } = applyRemote(job, serverEcho(job, { kmlRuns: null }), new Map());
    expect(after.kmlRuns!.map((r) => r.id)).toEqual(["k1"]);
    expect(planPush(after, state).kmlRuns).toHaveLength(1); // retried once the table exists
    expect(isMissingTable("Could not find the table 'public.kml_runs' in the schema cache")).toBe(true);
    expect(isMissingTable('relation "public.kml_runs" does not exist')).toBe(true);
    expect(isMissingTable("new row violates row-level security policy")).toBe(false);
  });

  it("old sync states without runs still plan an upload", () => {
    const job: Job = { ...shared(), kmlRuns: [run("k1")] };
    const { kmlRuns: _drop, ...old } = emptySyncState();
    expect(planPush(job, old).kmlRuns).toHaveLength(1);
  });
});
