"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useJob } from "@/components/JobProvider";
import { InstallApp } from "@/components/PwaSetup";
import { demoJob, jobFromPrint } from "@/lib/job";
import { deleteJob, listJobs, storageAvailable, type JobSummary } from "@/lib/storage";

export default function Home() {
  const { job, dispatch, openSavedJob, restoring, online } = useJob();
  const [saved, setSaved] = useState<JobSummary[]>([]);
  const refresh = useCallback(() => {
    if (storageAvailable()) listJobs().then(setSaved).catch(() => setSaved([]));
  }, []);
  useEffect(refresh, [refresh, job?.id, restoring]);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, make: () => Promise<Parameters<typeof dispatch>[0]>) {
    setBusy(label);
    setError(null);
    try {
      dispatch(await make());
      router.push("/job");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/barden-logo.png" alt="BARDEN" className="h-10 w-auto" />
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1f4690]">LineOS</h1>
        <p className="mt-2 text-slate-600">
          Upload the work print and master unit list, mark the highlighted work, and LineOS spreads the unit codes
          across the sheets without going over master.
        </p>
      </header>

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">New job</h2>
        <p className="text-sm text-slate-600">Work print PDF (multi-page). Text is read on this device.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run("upload", async () => ({ type: "set-job", job: await jobFromPrint(new Uint8Array(await f.arrayBuffer()), f.name) }));
            e.target.value = "";
          }}
        />
        <button className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Reading print…" : "Upload work print PDF"}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Demo: WO 4222352</h2>
        <p className="text-sm text-slate-600">
          Sample 6-sheet print with the crew&apos;s markups: S10B 3825, S16A 3600, S63A 5.
        </p>
        <button className="btn-ghost" disabled={!!busy} onClick={() => run("demo", async () => ({ type: "set-job", job: await demoJob() }))}>
          {busy === "demo" ? "Loading demo…" : "Open demo job"}
        </button>
      </section>

      <InstallApp />
      {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No signal — you can keep working. Everything saves on this phone.</p>}

      {saved.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-bold">Jobs saved on this phone</h2>
          <ul className="divide-y divide-slate-100">
            {saved.map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2">
                <button
                  className="flex-1 text-left"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(j.id);
                    if (j.id === job?.id || (await openSavedJob(j.id))) router.push("/job");
                    else setError("That job could not be opened.");
                    setBusy(null);
                  }}
                >
                  <span className="block font-semibold">
                    WO {j.woNumber || "—"} {j.id === job?.id && <span className="chip ml-1 border-emerald-300 bg-emerald-50 text-emerald-800">open</span>}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {j.sheets} sheets · {j.marks} marks · {j.dailyRows} daily rows · {j.photos} photos · saved{" "}
                    {new Date(j.savedAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </button>
                <button
                  className="btn min-h-9 px-2 text-red-700"
                  aria-label={`Delete WO ${j.woNumber} from this phone`}
                  onClick={async () => {
                    if (!window.confirm(`Delete WO ${j.woNumber || j.pdfName} from this phone? This cannot be undone.`)) return;
                    await deleteJob(j.id);
                    if (j.id === job?.id) dispatch({ type: "set-job", job: null });
                    refresh();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <footer className="mt-auto text-xs text-slate-500">
        Jobs save on this phone and work with no signal. Crew logins and upload to the office come in Milestone 4.
      </footer>
    </main>
  );
}
