"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { allocate, checkOverride, type AllocationResult, type OverrideCheck } from "@/lib/allocation";
import { downloadJob, OfflineError, shareJob, syncJob, watchJob, type Crew } from "@/lib/cloud";
import { currentJobId, getSyncState, loadJob, requestPersistence, saveJob, setSyncState, storageAvailable } from "@/lib/storage";
import { useAuth } from "./AuthProvider";
import { currentUser } from "@/lib/user";
import { type Point, type Photo, type DailyEntry, type GlossaryEntry, type KmlRun, type Job, type JobHeader, type Mark, type MasterItem } from "@/lib/types";

// The open job lives in memory and is saved to the phone (IndexedDB) after every change,
// so it works with no signal and survives closing the app. M4 adds upload to Supabase
// (same record shapes, created_by from the signed-in user).

type Action =
  | { type: "set-job"; job: Job | null }
  | { type: "header"; header: JobHeader }
  | { type: "master"; master: MasterItem[] }
  | { type: "glossary"; glossary: GlossaryEntry[] }
  | { type: "add-mark"; mark: Mark }
  | { type: "update-mark"; mark: Mark }
  | { type: "delete-mark"; id: string }
  | { type: "set-override"; sheetId: string; code: string; qty: number }
  | { type: "clear-override"; sheetId: string; code: string }
  | { type: "work-box"; sheetId: string; at: Point }
  | { type: "add-photo"; photo: Photo }
  | { type: "update-photo"; id: string; patch: Partial<Pick<Photo, "kind" | "sheetId">> }
  | { type: "delete-photo"; id: string }
  | { type: "sheet-task-code"; sheetId: string; unitCode: string; taskCode: string }
  | { type: "add-daily"; rows: DailyEntry[] }
  | { type: "update-daily"; row: DailyEntry }
  | { type: "delete-daily"; id: string }
  | { type: "add-kml-runs"; runs: KmlRun[] }
  | { type: "delete-kml-runs"; ids: string[] };

function reducer(job: Job | null, a: Action): Job | null {
  if (a.type === "set-job") return a.job;
  if (!job) return job;
  const now = new Date().toISOString();
  switch (a.type) {
    case "header":
      return { ...job, header: a.header };
    case "master":
      return { ...job, master: a.master };
    case "glossary":
      return { ...job, glossary: a.glossary };
    case "add-mark":
      return { ...job, marks: [...job.marks, a.mark] };
    case "update-mark":
      return {
        ...job,
        marks: job.marks.map((m) => (m.id === a.mark.id ? { ...a.mark, updatedBy: currentUser(), updatedAt: now } : m)),
      };
    case "delete-mark":
      return { ...job, marks: job.marks.filter((m) => m.id !== a.id) };
    case "set-override": {
      const rest = job.overrides.filter((o) => !(o.sheetId === a.sheetId && o.code === a.code));
      return {
        ...job,
        overrides: [
          ...rest,
          { jobId: job.id, sheetId: a.sheetId, code: a.code, qty: a.qty, locked: true, createdBy: currentUser(), createdAt: now },
        ],
      };
    }
    case "work-box":
      return { ...job, sheets: job.sheets.map((s) => (s.id === a.sheetId ? { ...s, workBoxAt: a.at } : s)) };
    case "add-photo":
      return { ...job, photos: [...job.photos, a.photo] };
    case "update-photo":
      return { ...job, photos: job.photos.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case "delete-photo":
      job.photos.find((p) => p.id === a.id && URL.revokeObjectURL(p.url));
      return { ...job, photos: job.photos.filter((p) => p.id !== a.id) };
    case "sheet-task-code":
      return {
        ...job,
        sheets: job.sheets.map((s) => {
          if (s.id !== a.sheetId) return s;
          const taskCodes = { ...(s.taskCodes ?? {}) };
          if (a.taskCode.trim()) taskCodes[a.unitCode] = a.taskCode.trim();
          else delete taskCodes[a.unitCode];
          return { ...s, taskCodes };
        }),
      };
    case "add-daily":
      return { ...job, daily: [...job.daily, ...a.rows] };
    case "update-daily":
      return { ...job, daily: job.daily.map((r) => (r.id === a.row.id ? { ...a.row, updatedBy: currentUser(), updatedAt: now } : r)) };
    case "delete-daily":
      return { ...job, daily: job.daily.filter((r) => r.id !== a.id) };
    case "add-kml-runs":
      return { ...job, kmlRuns: [...(job.kmlRuns ?? []), ...a.runs] };
    case "delete-kml-runs":
      return { ...job, kmlRuns: (job.kmlRuns ?? []).filter((r) => !a.ids.includes(r.id)) };
    case "clear-override":
      return { ...job, overrides: job.overrides.filter((o) => !(o.sheetId === a.sheetId && o.code === a.code)) };
  }
}

export type SaveState = "idle" | "saving" | "saved" | "error";
/** local = only on this phone; signed-out = shared but nobody signed in on this phone. */
export type SyncStatus = "local" | "signed-out" | "syncing" | "synced" | "offline" | "error";

type Ctx = {
  job: Job | null;
  result: AllocationResult | null;
  dispatch: (a: Action) => void;
  /** Sets and locks a sheet's number for a code; over-master values are rejected. */
  setOverride: (sheetId: string, code: string, qty: number) => OverrideCheck;
  /** True while the last open job is being read back from the phone. */
  restoring: boolean;
  saveState: SaveState;
  saveError: string | null;
  online: boolean;
  openSavedJob: (id: string) => Promise<boolean>;
  syncStatus: SyncStatus;
  /** Changes the office rejected on the last sync (e.g. over master), in plain words. */
  syncNotes: string[];
  dismissSyncNotes: () => void;
  syncNow: () => void;
  shareWith: (crew: Crew) => Promise<void>;
  openCloudJob: (id: string) => Promise<void>;
  /** Crew members cannot change master totals, task codes or approve export. */
  isForeman: boolean;
};

const JobContext = createContext<Ctx | null>(null);

const SAVE_DELAY_MS = 500;
const SYNC_AFTER_EDIT_MS = 1500;
const SYNC_EVERY_MS = 60_000;

export function JobProvider({ children }: { children: ReactNode }) {
  const [job, dispatch] = useReducer(reducer, null);
  const [restoring, setRestoring] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const result = useMemo(() => (job ? allocate(job) : null), [job]);
  // The job as last read from / written to the phone; skips saving what was just loaded.
  const persisted = useRef<Job | null>(null);
  const pending = useRef<Job | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { userId } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [syncNotes, setSyncNotes] = useState<string[]>([]);
  const jobRef = useRef<Job | null>(null);
  const lastSynced = useRef<Job | null>(null);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSyncRef = useRef<() => Promise<void>>(async () => {});
  const scheduleSync = useCallback((ms: number) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void runSyncRef.current(), ms);
  }, []);
  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // Saves run one at a time, in order, so an older copy never overwrites a newer one.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const toSave = pending.current;
    pending.current = null;
    if (!toSave) return chain.current;
    setSaveState("saving");
    chain.current = chain.current.then(async () => {
      try {
        await saveJob(toSave);
        persisted.current = toSave;
        if (!pending.current) setSaveState("saved");
        setSaveError(null);
      } catch (e) {
        setSaveState("error");
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    });
    return chain.current;
  }, []);

  // Reopen the last job on start (works with no signal).
  useEffect(() => {
    if (!storageAvailable()) return setRestoring(false);
    requestPersistence();
    (async () => {
      try {
        const id = await currentJobId();
        const saved = id ? await loadJob(id) : null;
        if (saved) {
          persisted.current = saved;
          dispatch({ type: "set-job", job: saved });
          setSaveState("saved");
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  // Save every change shortly after it happens.
  useEffect(() => {
    if (!job || job === persisted.current || !storageAvailable()) return;
    pending.current = job;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [job, flush]);

  // ---------- Shared projects: two-way sync with the crew ----------
  runSyncRef.current = async () => {
    const start = jobRef.current;
    if (!start?.cloud) return setSyncStatus("local");
    if (!userId) return setSyncStatus("signed-out");
    if (typeof navigator !== "undefined" && !navigator.onLine) return setSyncStatus("offline");
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }
    syncing.current = true;
    setSyncStatus("syncing");
    try {
      const res = await syncJob(start, await getSyncState(start.id));
      if (jobRef.current === start) {
        await setSyncState(start.id, res.state);
        lastSynced.current = res.job;
        dispatch({ type: "set-job", job: res.job });
      } else {
        syncAgain.current = true; // edited while syncing: go again with the newer copy
      }
      if (res.rejected.length) setSyncNotes(res.rejected);
      setSyncStatus("synced");
    } catch (e) {
      if (e instanceof OfflineError) setSyncStatus("offline");
      else {
        setSyncStatus("error");
        setSyncNotes([e instanceof Error ? e.message : String(e)]);
      }
    } finally {
      syncing.current = false;
      if (syncAgain.current) {
        syncAgain.current = false;
        scheduleSync(800);
      }
    }
  };

  // After a local edit to a shared project, send it shortly after.
  useEffect(() => {
    if (!job?.cloud) {
      setSyncStatus("local");
      return;
    }
    if (job !== lastSynced.current) scheduleSync(SYNC_AFTER_EDIT_MS);
  }, [job, scheduleSync]);

  // Live: someone else changed the project; also every minute and when signal returns.
  const sharedId = job?.cloud ? job.id : null;
  useEffect(() => {
    if (!sharedId || !userId) return;
    scheduleSync(0);
    const stop = watchJob(sharedId, () => scheduleSync(700));
    const every = setInterval(() => {
      if (document.visibilityState === "visible") scheduleSync(0);
    }, SYNC_EVERY_MS);
    const onOnline = () => scheduleSync(0);
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleSync(0);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      clearInterval(every);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sharedId, userId, scheduleSync]);

  const shareWith = useCallback(async (crew: Crew) => {
    const current = jobRef.current;
    if (!current) return;
    const shared = await shareJob(current, crew);
    dispatch({ type: "set-job", job: shared });
  }, []);

  const openCloudJob = useCallback(
    async (id: string) => {
      await flush();
      const local = await loadJob(id).catch(() => null);
      if (local?.cloud) {
        persisted.current = local;
        dispatch({ type: "set-job", job: local });
        pending.current = local;
        await flush();
        scheduleSync(0);
        return;
      }
      const { job: fresh, state } = await downloadJob(id);
      await setSyncState(id, state);
      lastSynced.current = fresh;
      dispatch({ type: "set-job", job: fresh });
    },
    [flush, scheduleSync],
  );

  // Write right away when the app goes to the background (phone locked, app switched).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const openSavedJob = useCallback(async (id: string) => {
    await flush();
    const saved = await loadJob(id);
    if (!saved) return false;
    persisted.current = saved;
    dispatch({ type: "set-job", job: saved });
    pending.current = saved; // marks it as the current job on the phone
    await flush();
    return true;
  }, [flush]);

  const setOverride = useCallback(
    (sheetId: string, code: string, qty: number): OverrideCheck => {
      if (!job) return { ok: false, error: "No job open." };
      const check = checkOverride(job, sheetId, code, qty);
      if (check.ok) dispatch({ type: "set-override", sheetId, code, qty });
      return check;
    },
    [job],
  );
  return (
    <JobContext.Provider
      value={{
        job,
        result,
        dispatch,
        setOverride,
        restoring,
        saveState,
        saveError,
        online,
        openSavedJob,
        syncStatus,
        syncNotes,
        dismissSyncNotes: () => setSyncNotes([]),
        syncNow: () => scheduleSync(0),
        shareWith,
        openCloudJob,
        isForeman: !job?.cloud || job.cloud.role === "foreman",
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJob(): Ctx {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useJob must be used inside JobProvider");
  return ctx;
}
