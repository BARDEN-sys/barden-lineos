"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import { allocate, checkOverride, type AllocationResult, type OverrideCheck } from "@/lib/allocation";
import { DEMO_USER, type Point, type Photo, type DailyEntry, type GlossaryEntry, type Job, type JobHeader, type Mark, type MasterItem } from "@/lib/types";

// M1 demo mode: the job lives in memory for this browser tab. M4 swaps this store for
// Supabase (same record shapes, created_by from the signed-in user).

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
  | { type: "delete-daily"; id: string };

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
        marks: job.marks.map((m) => (m.id === a.mark.id ? { ...a.mark, updatedBy: DEMO_USER, updatedAt: now } : m)),
      };
    case "delete-mark":
      return { ...job, marks: job.marks.filter((m) => m.id !== a.id) };
    case "set-override": {
      const rest = job.overrides.filter((o) => !(o.sheetId === a.sheetId && o.code === a.code));
      return {
        ...job,
        overrides: [
          ...rest,
          { jobId: job.id, sheetId: a.sheetId, code: a.code, qty: a.qty, locked: true, createdBy: DEMO_USER, createdAt: now },
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
      return { ...job, daily: job.daily.map((r) => (r.id === a.row.id ? { ...a.row, updatedBy: DEMO_USER, updatedAt: now } : r)) };
    case "delete-daily":
      return { ...job, daily: job.daily.filter((r) => r.id !== a.id) };
    case "clear-override":
      return { ...job, overrides: job.overrides.filter((o) => !(o.sheetId === a.sheetId && o.code === a.code)) };
  }
}

type Ctx = {
  job: Job | null;
  result: AllocationResult | null;
  dispatch: (a: Action) => void;
  /** Sets and locks a sheet's number for a code; over-master values are rejected. */
  setOverride: (sheetId: string, code: string, qty: number) => OverrideCheck;
};

const JobContext = createContext<Ctx | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
  const [job, dispatch] = useReducer(reducer, null);
  const result = useMemo(() => (job ? allocate(job) : null), [job]);
  const setOverride = useCallback(
    (sheetId: string, code: string, qty: number): OverrideCheck => {
      if (!job) return { ok: false, error: "No job open." };
      const check = checkOverride(job, sheetId, code, qty);
      if (check.ok) dispatch({ type: "set-override", sheetId, code, qty });
      return check;
    },
    [job],
  );
  return <JobContext.Provider value={{ job, result, dispatch, setOverride }}>{children}</JobContext.Provider>;
}

export function useJob(): Ctx {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useJob must be used inside JobProvider");
  return ctx;
}
