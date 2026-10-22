"use client";

import Link from "next/link";
import { useState } from "react";
import { AllocationTab } from "@/components/AllocationTab";
import { DailyTab } from "@/components/DailyTab";
import { ExportTab } from "@/components/ExportTab";
import { GlossaryTab } from "@/components/GlossaryTab";
import { useJob } from "@/components/JobProvider";
import { MapTab } from "@/components/MapTab";
import { MasterTab } from "@/components/MasterTab";
import { SheetsTab } from "@/components/SheetsTab";

const TABS = [
  { id: "sheets", label: "Sheets" },
  { id: "map", label: "Map" },
  { id: "master", label: "Master" },
  { id: "glossary", label: "Codes" },
  { id: "allocation", label: "Allocation" },
  { id: "daily", label: "Daily" },
  { id: "export", label: "Export" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function JobPage() {
  const { job, result, restoring, saveState, saveError, online, syncStatus, syncNotes, dismissSyncNotes, syncNow, isForeman } = useJob();
  const [tab, setTab] = useState<TabId>("sheets");

  if (!job && restoring) {
    return <main className="mx-auto max-w-lg px-4 py-10 text-slate-600">Opening your project…</main>;
  }
  if (!job) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <p>No project open.</p>
        <Link href="/" className="btn-primary self-start">Projects</Link>
      </main>
    );
  }

  const over = result?.blockers.length ?? 0;
  const flags = result?.flags.length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
          <Link href="/" className="btn min-h-9 shrink-0 border border-slate-600 px-3 text-xs text-slate-200" aria-label="All projects and new project">
            ☰ Projects
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{job.header.name ? `${job.header.name} · ` : ""}WO {job.header.woNumber || "—"}</p>
            <p className="truncate text-xs text-slate-400">
              {job.header.projectNumber && `Project ${job.header.projectNumber} · `}
              {job.sheets.length} sheets · {job.marks.length} marks
            </p>
          </div>
          {!online && <span className="chip border-amber-300 bg-amber-100 text-amber-900">Offline</span>}
          {job.cloud && (
            <button
              onClick={syncNow}
              className={`chip ${syncStatus === "error" ? "border-red-400 bg-red-600 text-white" : syncStatus === "synced" ? "border-emerald-400 text-emerald-300" : "border-slate-600 text-slate-300"}`}
              title="Sync with the crew now"
            >
              {syncStatus === "syncing"
                ? "Syncing…"
                : syncStatus === "synced"
                  ? "Synced ✓"
                  : syncStatus === "offline"
                    ? "Will upload when online"
                    : syncStatus === "signed-out"
                      ? "Sign in to sync"
                      : syncStatus === "error"
                        ? "Sync problem"
                        : "Shared"}
            </button>
          )}
          <Link href="/help" className="btn min-h-9 shrink-0 border border-slate-600 px-3 text-xs text-slate-200" aria-label="Help">
            ❓ Help
          </Link>
          <Link href="/crew" className="btn min-h-9 shrink-0 border border-slate-600 px-3 text-xs text-slate-200" aria-label="Crew and invites">
            👥 {job.cloud ? (isForeman ? "Crew" : "Crew") : "Share"}
          </Link>
          <span
            className={`chip ${saveState === "error" ? "border-red-400 bg-red-600 text-white" : "border-slate-600 text-slate-300"}`}
            title={saveError ?? undefined}
          >
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved!" : "Saved on phone ✓"}
          </span>
          {over > 0 && <span className="chip border-red-400 bg-red-600 text-white">Over master</span>}
          {flags > 0 && <span className="chip border-amber-300 bg-amber-400 text-amber-950">{flags} flag{flags > 1 ? "s" : ""}</span>}
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 pb-2 sm:flex">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`btn min-h-9 ${tab === t.id ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {syncNotes.length > 0 && (
        <div className="flex items-start gap-3 bg-red-600 px-4 py-2 text-sm text-white" role="alert">
          <div className="flex-1">
            <p className="font-semibold">Not accepted by the office — the shared numbers were kept:</p>
            {syncNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
          <button className="btn min-h-9 border border-white/50 px-3 text-xs" onClick={dismissSyncNotes}>
            OK
          </button>
        </div>
      )}
      {job.cloud && !isForeman && (
        <p className="bg-slate-800 px-4 py-1 text-xs text-slate-200">
          Crew member on {job.cloud.crewName ?? "this crew"}: you can mark, add photos and daily rows. Master totals, task codes and final export are the foreman&apos;s.
        </p>
      )}
      {saveState === "error" && (
        <p className="bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          Could not save on this phone: {saveError}. Keep the app open and free up storage space.
        </p>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-24 sm:pb-8">
        {tab === "sheets" && <SheetsTab />}
        {tab === "map" && <MapTab />}
        {tab === "master" && <MasterTab />}
        {tab === "glossary" && <GlossaryTab />}
        {tab === "allocation" && <AllocationTab />}
        {tab === "daily" && <DailyTab />}
        {tab === "export" && <ExportTab />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-14 text-[11px] font-semibold ${tab === t.id ? "text-slate-900" : "text-slate-400"}`}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
