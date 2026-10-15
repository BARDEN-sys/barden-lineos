"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

/** Sign in with a 6-digit code (or link) sent to your email, then (first time) your name. */
export function SignIn({ onDone, title = "Sign in" }: { onDone?: () => void; title?: string }) {
  const { userId, profile, sendCode, verifyCode, verifyLink, saveName } = useAuth();
  const [link, setLink] = useState("");
  const [to, setTo] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsName = !!userId && !profile?.display_name;

  if (userId && !needsName) {
    return null;
  }

  if (needsName) {
    return (
      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-bold">What should the crew call you?</h2>
        <p className="text-sm text-slate-600">Your name shows on every mark, daily row and photo you add.</p>
        <input className="input" autoFocus placeholder="e.g. Barry R." value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!name.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await saveName(name);
              onDone?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save name
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {!sentTo ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Your email
            <input
              className="input"
              autoFocus
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="btn-primary"
            disabled={!to.trim() || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await sendCode(to);
              setBusy(false);
              if (r.ok) setSentTo(to);
              else setError(r.error ?? "Could not send the code.");
            }}
          >
            {busy ? "Sending…" : "Send me a code"}
          </button>
          <p className="text-xs text-slate-500">We email you a 6-digit code. No password to remember.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            We emailed a 6-digit code to <b>{sentTo}</b>. Type it here. Check spam / junk if you don&apos;t see it in a
            minute. (If the email has a sign-in link instead, tapping it works too.)
          </p>
          <input
            className="input text-center font-mono text-2xl tracking-[0.4em]"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={code.replace(/\D/g, "").length < 6 || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await verifyCode(sentTo, code);
              setBusy(false);
              if (!r.ok) setError(r.error ?? "That code didn't work.");
              else onDone?.();
            }}
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-3">
            <p className="text-sm text-slate-700">
              <b>Email has a &ldquo;Log In&rdquo; link instead of a code?</b> Press and hold the link → <b>Copy Link</b>, then
              paste it here:
            </p>
            <input
              className="input"
              placeholder="Paste the sign-in link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!link.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await verifyLink(link);
                setBusy(false);
                if (!r.ok) setError(r.error ?? "That link didn't work.");
                else onDone?.();
              }}
            >
              Sign in with link
            </button>
          </div>
          <button className="btn-ghost" onClick={() => { setSentTo(null); setCode(""); setLink(""); setError(null); }}>
            Use a different email
          </button>
        </>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
