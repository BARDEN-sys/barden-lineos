"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SignIn } from "@/components/SignIn";

export default function LoginPage() {
  const router = useRouter();
  const { userId, profile, displayName, signOut, setPassword, saveName } = useAuth();
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const done = !!userId && !!profile?.display_name;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/barden-logo.png" alt="BARDEN" className="h-8 w-auto self-start" />
      {done ? (
        <section className="card flex flex-col gap-3">
          <p>
            Signed in as <b>{displayName}</b>.
          </p>
          <Link href="/" className="btn-primary">Go to projects</Link>
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
            <label className="flex flex-col gap-1 text-sm">
              Your name (shows on your marks)
              <input className="input" placeholder={profile?.display_name ?? ""} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button
              className="btn-ghost"
              disabled={!name.trim()}
              onClick={async () => {
                await saveName(name);
                setName("");
                setMsg("Name saved.");
              }}
            >
              Save name
            </button>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
            <label className="flex flex-col gap-1 text-sm">
              Set a password (so you can sign in on another phone without waiting for an email)
              <input className="input" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button
              className="btn-ghost"
              disabled={pw.length < 8}
              onClick={async () => {
                const r = await setPassword(pw);
                setPw("");
                setMsg(r.ok ? "Password set. Next time: Sign in → “I set a password”." : r.error ?? "Could not set the password.");
              }}
            >
              Save password
            </button>
          </div>
          {msg && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}
          <button className="btn-ghost" onClick={() => void signOut()}>Sign out</button>
        </section>
      ) : (
        <SignIn onDone={() => router.push("/")} />
      )}
      <Link href="/" className="text-sm text-slate-500 underline">Back</Link>
    </main>
  );
}
