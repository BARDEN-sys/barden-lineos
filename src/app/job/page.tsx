"use client";

import Link from "next/link";
import { useState } from "react";
import { AllocationTab } from "@/components/AllocationTab";
import { ExportTab } from "@/components/ExportTab";
import { GlossaryTab } from "@/components/GlossaryTab";
import { useJob } from "@/components/JobProvider";
import { MasterTab } from "@/components/MasterTab";
import { SheetsTab } from "@/components/SheetsTab";

const TABS = [
  { id: "sheets", label: "Sheets" },
  { id: "master", label: "Master" },
  { id: "glossary", label: "Codes" },
  { id: "allocation", label: "Allocation" },
  { id: "export", label: "Export" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function JobPage() {
  const { job, result } = useJob();
  const [tab, setTab] = useState<TabId>("sheets");

  if (!job) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <p>No job open in this tab.</p>
        <Link href="/" className="btn-primary self-start">Start a job</Link>
      </main>
    );
  }

  const over = result?.blockers.length ?? 0;
  const flags = result?.flags.length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="text-xs font-bold tracking-[0.2em] text-slate-400">LINEOS</Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">WO {job.header.woNumber || "—"}</p>
            <p className="truncate text-xs text-slate-400">
              {job.header.projectNumber && `Project ${job.header.projectNumber} · `}
              {job.sheets.length} sheets · {job.marks.length} marks
            </p>
          </div>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-24 sm:pb-8">
        {tab === "sheets" && <SheetsTab />}
        {tab === "master" && <MasterTab />}
        {tab === "glossary" && <GlossaryTab />}
        {tab === "allocation" && <AllocationTab />}
        {tab === "export" && <ExportTab />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-14 text-xs font-semibold ${tab === t.id ? "text-slate-900" : "text-slate-400"}`}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
