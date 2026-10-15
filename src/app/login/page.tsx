"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SignIn } from "@/components/SignIn";

export default function LoginPage() {
  const router = useRouter();
  const { userId, profile, displayName, signOut } = useAuth();
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
          <button className="btn-ghost" onClick={() => void signOut()}>Sign out</button>
        </section>
      ) : (
        <SignIn onDone={() => router.push("/")} />
      )}
      <Link href="/" className="text-sm text-slate-500 underline">Back</Link>
    </main>
  );
}
