import {
  applyRemote,
  emptySyncState,
  friendlyError,
  isEmptyPlan,
  isMissingTable,
  jobRow,
  photoPath,
  planPush,
  printPath,
  type DailyRow,
  type JobRow,
  type KmlRunRow,
  type MarkRow,
  type OverrideRow,
  type PhotoRow,
  type SyncState,
} from "./cloudRows";
import { supabase } from "./supabase";
import type { CrewRole, Job, Photo } from "./types";

// Talking to the LineOS Supabase project: sharing projects, two-way sync, crews and invites.

export class OfflineError extends Error {
  constructor(detail?: string) {
    super("No signal — this needs a connection. Try again when you have service.");
    this.cause = detail;
  }
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) {
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(res.error.message)) throw new OfflineError(res.error.message);
    throw new Error(`${what}: ${friendlyError(res.error.message)}`);
  }
  return res.data;
}

// ---------- Profile ----------
export type Profile = { id: string; display_name: string | null; email: string | null; phone: string | null };

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await supabase().from("profiles").select("id, display_name, email, phone").eq("id", userId).maybeSingle();
  return check(res, "Profile") as Profile | null;
}

export async function setDisplayName(userId: string, name: string): Promise<void> {
  check(await supabase().from("profiles").update({ display_name: name.trim() }).eq("id", userId), "Save name");
}

// ---------- Crews ----------
export type Crew = { id: string; name: string; role: CrewRole };

export async function myCrews(userId: string): Promise<Crew[]> {
  const res = await supabase().from("crew_members").select("role, crews(id, name)").eq("user_id", userId);
  const rows = check(res, "Crews") as unknown as { role: CrewRole; crews: { id: string; name: string } | null }[];
  return rows.filter((r) => r.crews).map((r) => ({ id: r.crews!.id, name: r.crews!.name, role: r.role }));
}

export async function createCrew(name: string, userId: string): Promise<Crew> {
  const res = await supabase().from("crews").insert({ name: name.trim(), created_by: userId }).select("id, name").single();
  const row = check(res, "Create crew") as { id: string; name: string };
  return { ...row, role: "foreman" };
}

export type Member = { userId: string; role: CrewRole; name: string; email: string | null; phone: string | null; scope: "crew" | "project" };

export async function crewMembers(crewId: string, jobId?: string): Promise<Member[]> {
  const sb = supabase();
  const crewRows = check(await sb.from("crew_members").select("user_id, role").eq("crew_id", crewId), "Members") as { user_id: string; role: CrewRole }[];
  const jobRows = jobId
    ? (check(await sb.from("job_members").select("user_id, role").eq("job_id", jobId), "Members") as { user_id: string; role: CrewRole }[])
    : [];
  const ids = [...new Set([...crewRows, ...jobRows].map((r) => r.user_id))];
  const profiles = ids.length
    ? (check(await sb.from("profiles").select("id, display_name, email, phone").in("id", ids), "Members") as Profile[])
    : [];
  const p = (id: string) => profiles.find((x) => x.id === id);
  const show = (id: string) => p(id)?.display_name || p(id)?.email || p(id)?.phone || "Crew member";
  return [
    ...crewRows.map((r) => ({ userId: r.user_id, role: r.role, name: show(r.user_id), email: p(r.user_id)?.email ?? null, phone: p(r.user_id)?.phone ?? null, scope: "crew" as const })),
    ...jobRows
      .filter((r) => !crewRows.some((c) => c.user_id === r.user_id))
      .map((r) => ({ userId: r.user_id, role: r.role, name: show(r.user_id), email: p(r.user_id)?.email ?? null, phone: p(r.user_id)?.phone ?? null, scope: "project" as const })),
  ];
}

export async function setMemberRole(m: Member, crewId: string, jobId: string | undefined, role: CrewRole): Promise<void> {
  const sb = supabase();
  if (m.scope === "crew") check(await sb.from("crew_members").update({ role }).eq("crew_id", crewId).eq("user_id", m.userId), "Change role");
  else check(await sb.from("job_members").update({ role }).eq("job_id", jobId!).eq("user_id", m.userId), "Change role");
}

export async function removeMember(m: Member, crewId: string, jobId?: string): Promise<void> {
  const sb = supabase();
  if (m.scope === "crew") check(await sb.from("crew_members").delete().eq("crew_id", crewId).eq("user_id", m.userId), "Remove");
  else check(await sb.from("job_members").delete().eq("job_id", jobId!).eq("user_id", m.userId), "Remove");
}

// ---------- Invites ----------
export type Invite = {
  id: string;
  token: string;
  crew_id: string;
  job_id: string | null;
  role: CrewRole;
  email: string | null;
  phone: string | null;
  label: string | null;
  multi_use: boolean;
  created_at: string;
  last_sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_count: number;
  revoked_at: string | null;
};

export const inviteUrl = (token: string) => `${typeof window !== "undefined" ? window.location.origin : "https://barden-lineos.vercel.app"}/join?t=${token}`;

export async function createInvite(input: {
  crewId: string;
  jobId: string | null;
  role: CrewRole;
  email?: string;
  phone?: string;
  label?: string;
  multiUse?: boolean;
  userId: string;
}): Promise<Invite> {
  const res = await supabase()
    .from("invites")
    .insert({
      crew_id: input.crewId,
      job_id: input.jobId,
      role: input.role,
      email: input.email || null,
      phone: input.phone || null,
      label: input.label || null,
      multi_use: !!input.multiUse,
      invited_by: input.userId,
    })
    .select("*")
    .single();
  return check(res, "Invite") as Invite;
}

export async function listInvites(crewId: string): Promise<Invite[]> {
  const res = await supabase().from("invites").select("*").eq("crew_id", crewId).order("created_at", { ascending: false });
  return check(res, "Invites") as Invite[];
}

export async function cancelInvite(id: string): Promise<void> {
  check(await supabase().from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", id), "Cancel invite");
}

export async function markInviteSent(id: string): Promise<void> {
  check(await supabase().from("invites").update({ last_sent_at: new Date().toISOString() }).eq("id", id), "Resend");
}

export type InvitePreview = { crew: string; project: string | null; role: CrewRole; invited_by: string | null; valid: boolean };

export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const res = await supabase().rpc("invite_preview", { p_token: token });
  return check(res, "Invite") as InvitePreview | null;
}

export async function acceptInvite(token: string): Promise<{ crew_id: string; job_id: string | null; role: CrewRole }> {
  const res = await supabase().rpc("accept_invite", { p_token: token });
  return check(res, "Join") as { crew_id: string; job_id: string | null; role: CrewRole };
}

// ---------- Projects ----------
export type CloudProject = { id: string; header: Job["header"]; crewId: string; crewName: string; updatedAt: string };

export async function listCloudProjects(): Promise<CloudProject[]> {
  const res = await supabase().from("jobs").select("id, header, crew_id, updated_at, crews(name)").order("updated_at", { ascending: false });
  const rows = check(res, "Projects") as unknown as { id: string; header: Job["header"]; crew_id: string; updated_at: string; crews: { name: string } | null }[];
  return rows.map((r) => ({ id: r.id, header: r.header, crewId: r.crew_id, crewName: r.crews?.name ?? "", updatedAt: r.updated_at }));
}

export async function jobRole(jobId: string): Promise<CrewRole | null> {
  const res = await supabase().rpc("job_role", { p_job: jobId });
  return (check(res, "Role") as CrewRole | null) ?? null;
}

/** Foreman shares a project that so far lives only on this phone. */
export async function shareJob(job: Job, crew: Crew): Promise<Job> {
  const sb = supabase();
  const shared: Job = { ...job, cloud: { crewId: crew.id, role: "foreman", crewName: crew.name } };
  check(await sb.from("jobs").insert(jobRow(shared)), "Share project");
  if (job.pdfBytes) {
    const up = await sb.storage.from("prints").upload(printPath(job.id), new Blob([new Uint8Array(job.pdfBytes)], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
    check({ data: up.data, error: up.error }, "Upload print");
    check(await sb.from("jobs").update({ pdf_path: printPath(job.id) }).eq("id", job.id), "Share project");
  }
  return shared;
}

async function downloadPhoto(r: PhotoRow): Promise<Photo | null> {
  const res = await supabase().storage.from("photos").download(r.storage_path);
  if (res.error || !res.data) return null;
  const blob = res.data;
  return {
    id: r.id,
    jobId: r.job_id,
    sheetId: r.sheet_id,
    kind: r.kind,
    blob,
    url: URL.createObjectURL(blob),
    width: r.width,
    height: r.height,
    takenAt: r.taken_at,
    createdBy: "",
  };
}

async function fetchRemote(jobId: string) {
  const sb = supabase();
  const [job, marks, overrides, daily, photos, runs] = await Promise.all([
    sb.from("jobs").select("*").eq("id", jobId).single(),
    sb.from("marks").select("*").eq("job_id", jobId),
    sb.from("overrides").select("*").eq("job_id", jobId),
    sb.from("daily_entries").select("*").eq("job_id", jobId),
    sb.from("photos").select("*").eq("job_id", jobId),
    sb.from("kml_runs").select("*").eq("job_id", jobId),
  ]);
  const jr = check(job, "Project") as JobRow & { pdf_path: string | null };
  const m = check(marks, "Marks") as MarkRow[];
  const o = check(overrides, "Overrides") as OverrideRow[];
  const d = check(daily, "Daily") as DailyRow[];
  const p = check(photos, "Photos") as PhotoRow[];
  // A server without the kml_runs table yet: runs stay on the phone that imported them.
  const k = runs.error && isMissingTable(runs.error.message) ? null : (check(runs, "Google Earth runs") as KmlRunRow[]);
  const ids = [...new Set([...m, ...o, ...d, ...(k ?? [])].flatMap((r) => [r.created_by, r.updated_by]).concat(p.map((r) => r.created_by)).filter(Boolean))] as string[];
  const profiles = ids.length ? (check(await sb.from("profiles").select("id, display_name, email, phone").in("id", ids), "Names") as Profile[]) : [];
  const names = Object.fromEntries(profiles.map((x) => [x.id, x.display_name || x.email || x.phone || "crew member"]));
  return { job: jr, marks: m, overrides: o, daily: d, photos: p, kmlRuns: k, names };
}

/** A crew member downloads a shared project onto this phone. */
export async function downloadJob(jobId: string): Promise<{ job: Job; state: SyncState }> {
  const sb = supabase();
  const role = (await jobRole(jobId)) ?? "crew";
  const remote = await fetchRemote(jobId);
  let pdfBytes: Uint8Array | null = null;
  if (remote.job.pdf_path) {
    const res = await sb.storage.from("prints").download(remote.job.pdf_path);
    if (res.data) pdfBytes = new Uint8Array(await res.data.arrayBuffer());
  }
  const crew = check(await sb.from("crews").select("name").eq("id", remote.job.crew_id).maybeSingle(), "Crew") as { name: string } | null;
  const shell: Job = {
    id: jobId,
    header: remote.job.header,
    pdfName: remote.job.pdf_name ?? "print.pdf",
    pdfBytes,
    sheets: remote.job.sheets,
    master: remote.job.master,
    glossary: remote.job.glossary,
    marks: [],
    overrides: [],
    photos: [],
    daily: [],
    kmlRuns: [],
    cloud: { crewId: remote.job.crew_id, role, crewName: crew?.name },
    createdBy: "",
    createdAt: new Date().toISOString(),
  };
  const downloaded = new Map<string, Photo>();
  for (const r of remote.photos.filter((x) => !x.deleted)) {
    const ph = await downloadPhoto(r);
    if (ph) downloaded.set(r.id, ph);
  }
  return applyRemote(shell, remote, downloaded);
}

export type SyncResult = { job: Job; state: SyncState; rejected: string[] };

/**
 * Send what changed on this phone, then take the server's copy as the truth.
 * Rule rejections (over master, foreman-only changes) are reported and rolled back on the
 * phone; a lost connection throws OfflineError and nothing is lost (it retries later).
 */
export async function syncJob(job: Job, state: SyncState | null): Promise<SyncResult> {
  if (!job.cloud) throw new Error("Project is not shared");
  const sb = supabase();
  const st = state ?? emptySyncState();
  const plan = planPush(job, st);
  const rejected: string[] = [];
  const note = (res: { error: { message: string } | null }, what: string) => {
    if (!res.error) return;
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(res.error.message)) throw new OfflineError(res.error.message);
    rejected.push(`${what}: ${friendlyError(res.error.message)}`);
  };

  if (!isEmptyPlan(plan)) {
    // Project settings first: master totals decide what the crew rows may hold.
    if (plan.job) note(await sb.from("jobs").update(plan.job).eq("id", job.id), "Project");
    if (plan.marks.length) note(await sb.from("marks").upsert(plan.marks), "Marks");
    for (const id of plan.markDeletes) note(await sb.from("marks").update({ deleted: true }).eq("id", id), "Delete mark");
    for (const r of plan.overrides) note(await sb.from("overrides").upsert(r), `Lock ${r.code}`);
    for (const k of plan.overrideDeletes)
      note(await sb.from("overrides").update({ deleted: true }).eq("job_id", job.id).eq("sheet_id", k.sheetId).eq("code", k.code), "Unlock");
    // Deletes before inserts so freeing room under master happens first.
    for (const id of plan.dailyDeletes) note(await sb.from("daily_entries").update({ deleted: true }).eq("id", id), "Delete daily row");
    for (const r of plan.daily) note(await sb.from("daily_entries").upsert(r), `Daily ${r.unit_code} ${r.qty}`);
    for (const p of plan.newPhotos) {
      const up = await sb.storage.from("photos").upload(photoPath(job.id, p.id), p.blob, { upsert: true, contentType: "image/jpeg" });
      note({ error: up.error }, "Photo upload");
      if (!up.error) {
        const r: PhotoRow = { id: p.id, job_id: job.id, sheet_id: p.sheetId, kind: p.kind, storage_path: photoPath(job.id, p.id), width: p.width, height: p.height, taken_at: p.takenAt, deleted: false };
        note(await sb.from("photos").upsert(r), "Photo");
      }
    }
    for (const r of plan.photoUpdates) note(await sb.from("photos").update({ sheet_id: r.sheet_id, kind: r.kind }).eq("id", r.id), "Photo");
    for (const id of plan.photoDeletes) note(await sb.from("photos").update({ deleted: true }).eq("id", id), "Delete photo");
    // Google Earth runs; skipped quietly until the server has the kml_runs table.
    const runs = (res: { error: { message: string } | null }, what: string) => note(res.error && isMissingTable(res.error.message) ? { error: null } : res, what);
    if (plan.kmlRuns.length) runs(await sb.from("kml_runs").upsert(plan.kmlRuns), "Google Earth runs");
    for (const id of plan.kmlRunDeletes) runs(await sb.from("kml_runs").update({ deleted: true }).eq("id", id), "Remove Google Earth run");
  }

  const remote = await fetchRemote(job.id);
  const known = new Set(job.photos.map((p) => p.id));
  const downloaded = new Map<string, Photo>();
  for (const r of remote.photos.filter((x) => !x.deleted && !known.has(x.id))) {
    const ph = await downloadPhoto(r);
    if (ph) downloaded.set(r.id, ph);
  }
  const role = (await jobRole(job.id)) ?? job.cloud.role;
  const merged = applyRemote({ ...job, cloud: { ...job.cloud, role } }, remote, downloaded);
  return { ...merged, rejected };
}

/** Live updates: calls `onChange` when anyone changes this project. Returns an unsubscribe. */
export function watchJob(jobId: string, onChange: () => void): () => void {
  const sb = supabase();
  const channel = sb.channel(`job-${jobId}`);
  for (const table of ["marks", "overrides", "daily_entries", "photos"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `job_id=eq.${jobId}` }, onChange);
  }
  channel.on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, onChange);
  channel.subscribe();
  // Own channel: a server without the kml_runs table must not break the live updates above.
  const runs = sb.channel(`job-${jobId}-kml`);
  runs.on("postgres_changes", { event: "*", schema: "public", table: "kml_runs", filter: `job_id=eq.${jobId}` }, onChange);
  runs.subscribe();
  return () => {
    void sb.removeChannel(channel);
    void sb.removeChannel(runs);
  };
}
