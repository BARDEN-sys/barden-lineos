"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useJob } from "@/components/JobProvider";
import { NewProject } from "@/components/NewProject";
import { InstallApp } from "@/components/PwaSetup";
import { demoJob } from "@/lib/job";
import { listCloudProjects, type CloudProject } from "@/lib/cloud";
import { deleteJob, listJobs, storageAvailable, type JobSummary } from "@/lib/storage";

export default function Home() {
  const { job, dispatch, openSavedJob, openCloudJob, restoring, online } = useJob();
  const { userId, displayName, ready } = useAuth();
  const [cloud, setCloud] = useState<CloudProject[]>([]);
  const [saved, setSaved] = useState<JobSummary[]>([]);
  const refresh = useCallback(() => {
    if (storageAvailable()) listJobs().then(setSaved).catch(() => setSaved([]));
  }, []);
  useEffect(refresh, [refresh, job?.id, restoring]);
  useEffect(() => {
    if (!userId || !online) return setCloud([]);
    listCloudProjects().then(setCloud).catch(() => setCloud([]));
  }, [userId, online, job?.id]);
  const onPhone = new Set(saved.map((s) => s.id));
  const toDownload = cloud.filter((c) => !onPhone.has(c.id));
  const router = useRouter();
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

      {ready && (
        <section className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
          {userId ? (
            <>
              <span className="flex-1">
                Signed in as <b>{displayName || "you"}</b>
              </span>
              <Link href="/login" className="btn-ghost min-h-9 px-3 text-xs">Account</Link>
            </>
          ) : (
            <>
              <span className="flex-1 text-slate-600">Sign in to share projects with your crew.</span>
              <Link href="/login" className="btn-primary min-h-9 px-3 text-xs">Sign in</Link>
            </>
          )}
        </section>
      )}

      {toDownload.length > 0 && (
        <section className="card flex flex-col gap-2 border-blue-300">
          <h2 className="font-bold">Crew projects to download</h2>
          <p className="text-xs text-slate-500">Shared with you. Download once; then it works with no signal and stays in sync.</p>
          <ul className="divide-y divide-slate-100">
            {toDownload.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">
                  <span className="block font-semibold">
                    {c.header.name ? `${c.header.name} · ` : ""}WO {c.header.woNumber || "—"}
                  </span>
                  <span className="block text-xs text-slate-500">{c.crewName}</span>
                </span>
                <button
                  className="btn-primary min-h-9"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(c.id);
                    setError(null);
                    try {
                      await openCloudJob(c.id);
                      router.push("/job");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === c.id ? "Downloading…" : "Download"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewProject busy={!!busy} onCreate={(newJob) => run("new", async () => ({ type: "set-job", job: newJob }))} />

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Demo: WO 4222352</h2>
        <p className="text-sm text-slate-600">
          Sample 5-sheet project built from the crew&apos;s WO 4222352 markups: S10B 3825, S16A 3600.
        </p>
        <button className="btn-ghost" disabled={!!busy} onClick={() => run("demo", async () => ({ type: "set-job", job: await demoJob() }))}>
          {busy === "demo" ? "Loading demo…" : "Open demo project"}
        </button>
      </section>

      <InstallApp />
      {!online && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No signal — you can keep working. Everything saves on this phone.</p>}

      {saved.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-bold">Projects on this phone</h2>
          <ul className="divide-y divide-slate-100">
            {saved.map((j) => (
              <li key={j.id} className="flex items-center gap-3 py-2">
                <button
                  className="flex-1 text-left"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(j.id);
                    if (j.id === job?.id || (await openSavedJob(j.id))) router.push("/job");
                    else setError("That project could not be opened.");
                    setBusy(null);
                  }}
                >
                  <span className="block font-semibold">
                    {j.name ? `${j.name} · ` : ""}WO {j.woNumber || "—"}
                    {j.projectNumber && j.projectNumber !== j.woNumber && <span className="font-normal text-slate-500"> · Project {j.projectNumber}</span>}{" "}
                    {j.shared && <span className="chip ml-1 border-blue-300 bg-blue-50 text-blue-800">shared</span>}
                    {j.id === job?.id && <span className="chip ml-1 border-emerald-300 bg-emerald-50 text-emerald-800">open</span>}
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
                    if (!window.confirm(`Delete project ${j.name || `WO ${j.woNumber}` || j.pdfName} from this phone? This cannot be undone.`)) return;
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
        Projects save on this phone and work with no signal. Shared projects upload automatically when there&apos;s signal.
      </footer>
    </main>
  );
}
