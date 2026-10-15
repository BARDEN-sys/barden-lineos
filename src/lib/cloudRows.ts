import type { DailyEntry, Job, Mark, Override, Photo } from "./types";

// Pure mapping between the on-phone Job and the shared Supabase rows, plus the diff that
// decides what to upload. No network here, so it is unit-tested directly.

export type JobRow = {
  id: string;
  crew_id: string;
  header: Job["header"];
  master: Job["master"];
  glossary: Job["glossary"];
  sheets: Job["sheets"];
  pdf_name: string | null;
};
export type MarkRow = {
  id: string;
  job_id: string;
  sheet_id: string;
  data: Omit<Mark, "id" | "jobId" | "sheetId" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt">;
  deleted: boolean;
  created_at: string;
  created_by?: string;
  updated_by?: string | null;
  updated_at?: string;
};
export type OverrideRow = {
  job_id: string;
  sheet_id: string;
  code: string;
  qty: number;
  locked: boolean;
  deleted: boolean;
  created_at: string;
  created_by?: string;
  updated_by?: string | null;
  updated_at?: string;
};
export type DailyRow = {
  id: string;
  job_id: string;
  unit_code: string;
  qty: number;
  data: { day: string; sheetId: string | null; taskCode: string; note?: string };
  deleted: boolean;
  created_at: string;
  created_by?: string;
  updated_by?: string | null;
  updated_at?: string;
};
export type PhotoRow = {
  id: string;
  job_id: string;
  sheet_id: string | null;
  kind: Photo["kind"];
  storage_path: string;
  width: number;
  height: number;
  taken_at: string;
  deleted: boolean;
  created_by?: string;
};

/** What was last uploaded/downloaded, as content hashes, so only real changes are sent. */
export type SyncState = {
  job: string;
  marks: Record<string, string>;
  overrides: Record<string, string>;
  daily: Record<string, string>;
  photos: Record<string, string>;
  syncedAt: string | null;
};
export const emptySyncState = (): SyncState => ({ job: "", marks: {}, overrides: {}, daily: {}, photos: {}, syncedAt: null });

/** Stable JSON (sorted keys) so equal content always hashes the same. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export const overrideKey = (o: { sheetId: string; code: string }) => `${o.sheetId}|${o.code}`;
export const photoPath = (jobId: string, photoId: string) => `${jobId}/${photoId}.jpg`;
export const printPath = (jobId: string) => `${jobId}/print.pdf`;

export function jobRow(job: Job): JobRow {
  return {
    id: job.id,
    crew_id: job.cloud!.crewId,
    header: job.header,
    master: job.master,
    glossary: job.glossary,
    sheets: job.sheets,
    pdf_name: job.pdfName || null,
  };
}
const jobContent = (r: JobRow) => stableJson({ header: r.header, master: r.master, glossary: r.glossary, sheets: r.sheets });

export function markRow(m: Mark): MarkRow {
  const { id, jobId, sheetId, createdBy: _c, createdAt, updatedBy: _u, updatedAt: _ua, ...data } = m;
  return { id, job_id: jobId, sheet_id: sheetId, data, deleted: false, created_at: createdAt };
}
const markContent = (r: MarkRow) => stableJson({ sheet: r.sheet_id, data: r.data });

export function overrideRow(o: Override): OverrideRow {
  return { job_id: o.jobId, sheet_id: o.sheetId, code: o.code, qty: o.qty, locked: o.locked, deleted: false, created_at: o.createdAt || new Date().toISOString() };
}
const overrideContent = (r: OverrideRow) => stableJson({ qty: r.qty, locked: r.locked });

export function dailyRow(e: DailyEntry): DailyRow {
  return {
    id: e.id,
    job_id: e.jobId,
    unit_code: e.unitCode,
    qty: e.qty,
    data: { day: e.day, sheetId: e.sheetId, taskCode: e.taskCode, note: e.note },
    deleted: false,
    created_at: e.createdAt,
  };
}
const dailyContent = (r: DailyRow) => stableJson({ unit: r.unit_code, qty: r.qty, data: r.data });

export function photoRow(p: Photo): PhotoRow {
  return {
    id: p.id,
    job_id: p.jobId,
    sheet_id: p.sheetId,
    kind: p.kind,
    storage_path: photoPath(p.jobId, p.id),
    width: p.width,
    height: p.height,
    taken_at: p.takenAt,
    deleted: false,
  };
}
const photoContent = (r: PhotoRow) => stableJson({ sheet: r.sheet_id, kind: r.kind });

export type PushPlan = {
  job: JobRow | null;
  marks: MarkRow[];
  markDeletes: string[];
  overrides: OverrideRow[];
  overrideDeletes: { sheetId: string; code: string }[];
  daily: DailyRow[];
  dailyDeletes: string[];
  /** Photos not yet uploaded (need the file upload first). */
  newPhotos: Photo[];
  photoUpdates: PhotoRow[];
  photoDeletes: string[];
};

export function isEmptyPlan(p: PushPlan): boolean {
  return (
    !p.job &&
    !p.marks.length &&
    !p.markDeletes.length &&
    !p.overrides.length &&
    !p.overrideDeletes.length &&
    !p.daily.length &&
    !p.dailyDeletes.length &&
    !p.newPhotos.length &&
    !p.photoUpdates.length &&
    !p.photoDeletes.length
  );
}

/** Everything on the phone that differs from what was last synced. */
export function planPush(job: Job, state: SyncState): PushPlan {
  const isForeman = job.cloud?.role === "foreman";
  const jr = jobRow(job);
  const plan: PushPlan = {
    job: isForeman && jobContent(jr) !== state.job ? jr : null,
    marks: [],
    markDeletes: [],
    overrides: [],
    overrideDeletes: [],
    daily: [],
    dailyDeletes: [],
    newPhotos: [],
    photoUpdates: [],
    photoDeletes: [],
  };

  const seenMarks = new Set<string>();
  for (const m of job.marks) {
    seenMarks.add(m.id);
    const r = markRow(m);
    if (state.marks[m.id] !== markContent(r)) plan.marks.push(r);
  }
  plan.markDeletes = Object.keys(state.marks).filter((id) => !seenMarks.has(id));

  const seenOv = new Set<string>();
  for (const o of job.overrides) {
    const k = overrideKey(o);
    seenOv.add(k);
    const r = overrideRow(o);
    if (state.overrides[k] !== overrideContent(r)) plan.overrides.push(r);
  }
  plan.overrideDeletes = Object.keys(state.overrides)
    .filter((k) => !seenOv.has(k))
    .map((k) => {
      const [sheetId, code] = k.split("|");
      return { sheetId, code };
    });

  const seenDaily = new Set<string>();
  for (const e of job.daily) {
    seenDaily.add(e.id);
    const r = dailyRow(e);
    if (state.daily[e.id] !== dailyContent(r)) plan.daily.push(r);
  }
  plan.dailyDeletes = Object.keys(state.daily).filter((id) => !seenDaily.has(id));

  const seenPhotos = new Set<string>();
  for (const p of job.photos) {
    seenPhotos.add(p.id);
    const r = photoRow(p);
    if (!(p.id in state.photos)) plan.newPhotos.push(p);
    else if (state.photos[p.id] !== photoContent(r)) plan.photoUpdates.push(r);
  }
  plan.photoDeletes = Object.keys(state.photos).filter((id) => !seenPhotos.has(id));
  return plan;
}

export type RemoteRows = {
  job: JobRow & { pdf_path?: string | null };
  marks: MarkRow[];
  overrides: OverrideRow[];
  daily: DailyRow[];
  photos: PhotoRow[];
  /** user id -> display name */
  names: Record<string, string>;
};

const editedLater = (created?: string, updated?: string) =>
  !!created && !!updated && new Date(updated).getTime() - new Date(created).getTime() > 2000;

/**
 * Build the phone's copy from the server's rows. The server is the shared truth: anything a
 * rule rejected (e.g. over master) disappears here and the crew sees the server's numbers.
 * Photo files already on the phone are reused; `downloaded` supplies newly fetched ones.
 */
export function applyRemote(local: Job, remote: RemoteRows, downloaded: Map<string, Photo>): { job: Job; state: SyncState } {
  const name = (id?: string | null) => (id ? remote.names[id] || "crew member" : "crew member");
  const live = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

  const marks: Mark[] = live(remote.marks).map((r) => ({
    ...r.data,
    id: r.id,
    jobId: r.job_id,
    sheetId: r.sheet_id,
    createdBy: name(r.created_by),
    createdAt: r.created_at,
    ...(editedLater(r.created_at, r.updated_at) ? { updatedBy: name(r.updated_by), updatedAt: r.updated_at } : {}),
  }));
  const overrides: Override[] = live(remote.overrides).map((r) => ({
    jobId: r.job_id,
    sheetId: r.sheet_id,
    code: r.code,
    qty: r.qty,
    locked: r.locked,
    createdBy: name(r.updated_by ?? r.created_by),
    createdAt: r.created_at,
  }));
  const daily: DailyEntry[] = live(remote.daily).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    day: r.data.day,
    sheetId: r.data.sheetId,
    unitCode: r.unit_code,
    taskCode: r.data.taskCode,
    qty: r.qty,
    note: r.data.note,
    createdBy: name(r.created_by),
    createdAt: r.created_at,
    ...(editedLater(r.created_at, r.updated_at) ? { updatedBy: name(r.updated_by), updatedAt: r.updated_at } : {}),
  }));
  const localPhotos = new Map(local.photos.map((p) => [p.id, p]));
  const photos: Photo[] = live(remote.photos).flatMap((r) => {
    const have = localPhotos.get(r.id) ?? downloaded.get(r.id);
    return have ? [{ ...have, sheetId: r.sheet_id, kind: r.kind, createdBy: name(r.created_by) }] : [];
  });

  const job: Job = {
    ...local,
    header: remote.job.header,
    master: remote.job.master,
    glossary: remote.job.glossary,
    sheets: remote.job.sheets,
    pdfName: remote.job.pdf_name ?? local.pdfName,
    marks,
    overrides,
    daily,
    photos,
  };

  const state: SyncState = {
    job: jobContent(remote.job),
    marks: Object.fromEntries(live(remote.marks).map((r) => [r.id, markContent(r)])),
    overrides: Object.fromEntries(live(remote.overrides).map((r) => [overrideKey({ sheetId: r.sheet_id, code: r.code }), overrideContent(r)])),
    daily: Object.fromEntries(live(remote.daily).map((r) => [r.id, dailyContent(r)])),
    photos: Object.fromEntries(
      live(remote.photos)
        .filter((r) => photos.some((p) => p.id === r.id))
        .map((r) => [r.id, photoContent(r)]),
    ),
    syncedAt: new Date().toISOString(),
  };
  return { job, state };
}

/** Turn a server error into words for the crew. */
export function friendlyError(message: string): string {
  const m = message.match(/LINEOS_[A-Z_]+:\s*(.*)$/s);
  if (m) return m[1].trim();
  if (/row-level security|permission denied/i.test(message)) return "Only the foreman can change that.";
  if (/Failed to fetch|NetworkError|network/i.test(message)) return "No connection — will retry.";
  return message;
}
