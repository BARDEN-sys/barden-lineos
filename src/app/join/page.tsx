"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useJob } from "@/components/JobProvider";
import { SignIn } from "@/components/SignIn";
import { acceptInvite, previewInvite, type InvitePreview } from "@/lib/cloud";

function JoinInner() {
  const router = useRouter();
  const { userId, profile } = useAuth();
  const { openCloudJob } = useJob();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t);
    if (!t) return setPreview(null);
    previewInvite(t)
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const signedIn = !!userId && !!profile?.display_name;

  async function join() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await acceptInvite(token);
      if (r.job_id) {
        await openCloudJob(r.job_id);
        router.push("/job");
      } else {
        router.push("/?joined=1");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/barden-logo.png" alt="BARDEN" className="h-8 w-auto self-start" />
      {preview === undefined && <p className="text-slate-600">Checking your invite…</p>}
      {preview === null && (
        <section className="card">
          <p className="font-semibold">This invite link doesn&apos;t work.</p>
          <p className="text-sm text-slate-600">Ask your foreman to send a new one.</p>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </section>
      )}
      {preview && (
        <>
          <section className="card flex flex-col gap-1">
            <p className="text-sm text-slate-500">You&apos;re invited to</p>
            <p className="text-xl font-bold">{preview.project ?? preview.crew}</p>
            <p className="text-sm text-slate-600">
              {preview.project ? `Crew: ${preview.crew} · ` : "Whole crew · "}
              as <b>{preview.role === "foreman" ? "Foreman" : "Crew member"}</b>
              {preview.invited_by && ` · from ${preview.invited_by}`}
            </p>
            {!preview.valid && <p className="mt-2 font-semibold text-red-700">This invite was cancelled, used or has expired. Ask for a new one.</p>}
          </section>
          {preview.valid && !signedIn && <SignIn title="Sign in to join" />}
          {preview.valid && signedIn && (
            <button className="btn-primary min-h-14 text-base" disabled={busy} onClick={join}>
              {busy ? "Joining…" : "Join"}
            </button>
          )}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="text-xs text-slate-500">
            Tip: add LineOS to your home screen (Share → Add to Home Screen) so it works with no signal.
          </p>
        </>
      )}
      <Link href="/" className="text-sm text-slate-500 underline">Go to LineOS</Link>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  );
}
