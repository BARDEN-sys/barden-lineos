"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VoiceButton } from "@/components/VoiceButton";
import { findHelp, HELP, speechFor, type HelpTopic } from "@/lib/help";

/** Help desk: ask by voice or typing, and have the steps read out loud. */
export default function HelpPage() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(true);

  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => window.speechSynthesis?.cancel();
  }, []);

  function read(t: HelpTopic) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speaking === t.id) return setSpeaking(null);
    const u = new SpeechSynthesisUtterance(speechFor(t));
    u.lang = "en-US";
    u.rate = 0.95;
    u.onend = () => setSpeaking((s) => (s === t.id ? null : s));
    u.onerror = () => setSpeaking(null);
    setSpeaking(t.id);
    synth.speak(u);
  }

  function ask(q: string) {
    setQuestion(q);
    setAsked(q);
    const best = findHelp(q)[0];
    if (best) {
      setOpen(best.id);
      read(best);
    }
  }

  const answers = asked ? findHelp(asked) : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/barden-logo.png" alt="BARDEN" className="h-7 w-auto" />
        <h1 className="text-xl font-bold">Help</h1>
        <Link href="/" className="btn-ghost ml-auto min-h-9 px-3 text-sm">Back</Link>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Ask a question</h2>
        <VoiceButton label="Tap and ask out loud" onText={ask} />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask(question);
          }}
        >
          <input className="input flex-1" placeholder="e.g. how do I measure a run" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button className="btn-primary" type="submit">Ask</button>
        </form>
        {asked && !answers.length && (
          <p className="text-sm text-slate-600">No match for “{asked}”. Try other words, or pick a topic below.</p>
        )}
        {!canSpeak && <p className="text-xs text-slate-500">This browser can&apos;t read out loud; the steps are below.</p>}
      </section>

      {answers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-600">Best answer{answers.length > 1 ? "s" : ""}</h2>
          {answers.map((t) => (
            <Topic key={t.id} t={t} open={open === t.id} speaking={speaking === t.id} canSpeak={canSpeak} onToggle={() => setOpen(open === t.id ? null : t.id)} onRead={() => read(t)} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-600">All topics</h2>
        {HELP.map((t) => (
          <Topic key={t.id} t={t} open={open === t.id} speaking={speaking === t.id} canSpeak={canSpeak} onToggle={() => setOpen(open === t.id ? null : t.id)} onRead={() => read(t)} />
        ))}
      </section>
    </main>
  );
}

function Topic({ t, open, speaking, canSpeak, onToggle, onRead }: { t: HelpTopic; open: boolean; speaking: boolean; canSpeak: boolean; onToggle: () => void; onRead: () => void }) {
  return (
    <div className="card p-0">
      <div className="flex items-center gap-2 p-3">
        <button className="flex-1 text-left font-semibold" onClick={onToggle} aria-expanded={open}>
          {open ? "▾" : "▸"} {t.title}
        </button>
        {canSpeak && (
          <button className={`btn min-h-9 shrink-0 border px-3 text-sm ${speaking ? "border-red-500 bg-red-600 text-white" : "border-slate-300"}`} onClick={onRead}>
            {speaking ? "■ Stop" : "🔊 Read to me"}
          </button>
        )}
      </div>
      {open && (
        <ol className="list-decimal space-y-2 border-t border-slate-100 py-3 pr-4 pl-9 text-[15px]">
          {t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
