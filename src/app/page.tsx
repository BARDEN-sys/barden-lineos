"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useJob } from "@/components/JobProvider";
import { demoJob, jobFromPrint } from "@/lib/job";

export default function Home() {
  const { job, dispatch } = useJob();
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

      {job && (
        <button className="btn-ghost" onClick={() => router.push("/job")}>
          Back to open job (WO {job.header.woNumber || job.pdfName})
        </button>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <footer className="mt-auto text-xs text-slate-500">
        Demo mode — jobs stay in this browser tab only. Crew logins and saved jobs come in Milestone 4.
      </footer>
    </main>
  );
}
