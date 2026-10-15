"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VoiceButton } from "@/components/VoiceButton";
import { findHelp, HELP, speechFor, type HelpTopic } from "@/lib/help";

const VOICE_KEY = "lineos-voice";

/** English voices, clearest first: downloaded Enhanced/Premium voices, then US, then the rest. */
function englishVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) =>
    (/premium/i.test(v.name) ? 0 : /enhanced|neural|natural/i.test(v.name) ? 1 : 2) * 10 + (v.lang === "en-US" ? 0 : 1);
  // Novelty voices (Bells, Bubbles, Whisper, …) are hard to understand.
  const silly = /bells|bubbles|bad news|boing|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|deranged|hysterical|pipe organ/i;
  return all.filter((v) => v.lang.toLowerCase().startsWith("en") && !silly.test(v.name)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Help desk: ask by voice or typing, and have the steps read out loud. */
export default function HelpPage() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [canSpeak, setCanSpeak] = useState(true);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(0.9);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    setCanSpeak(!!synth);
    if (!synth) return;
    try {
      const saved = JSON.parse(localStorage.getItem(VOICE_KEY) ?? "{}");
      if (saved.voice) setVoiceName(saved.voice);
      if (saved.rate) setRate(saved.rate);
    } catch {}
    // iPhone/iPad load the voice list a moment after the page opens.
    const load = () => setVoices(englishVoices(synth.getVoices()));
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  function saveVoice(next: { voice?: string; rate?: number }) {
    const v = next.voice ?? voiceName;
    const r = next.rate ?? rate;
    setVoiceName(v);
    setRate(r);
    try {
      localStorage.setItem(VOICE_KEY, JSON.stringify({ voice: v, rate: r }));
    } catch {}
  }

  function say(text: string, id: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === voiceName) ?? voices[0];
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = rate;
    u.onend = () => setSpeaking((s) => (s === id ? null : s));
    u.onerror = () => setSpeaking(null);
    setSpeaking(id);
    synth.speak(u);
  }

  function read(t: HelpTopic) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speaking === t.id) return setSpeaking(null);
    say(speechFor(t), t.id);
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

      {canSpeak && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">🔊 Reading voice</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Voice
              <select className="input" value={voiceName || voices[0]?.name || ""} onChange={(e) => saveVoice({ voice: e.target.value })}>
                {voices.map((v) => (
                  <option key={v.name + v.lang} value={v.name}>
                    {v.name} ({v.lang}){/enhanced|premium|neural|natural/i.test(v.name) ? " ★" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Speed: {rate === 1 ? "normal" : rate < 1 ? "slower" : "faster"}
              <input type="range" min={0.6} max={1.3} step={0.05} value={rate} onChange={(e) => saveVoice({ rate: Number(e.target.value) })} />
            </label>
            <button
              className="btn-primary self-start"
              onClick={() => say("This is how the help will sound. Tap New project, then choose the work print.", "test")}
            >
              ▶ Test this voice
            </button>
            <p className="text-xs text-slate-500">
              ★ = clearer, more natural voice. For the clearest voices on iPhone or iPad: Settings → Accessibility →
              Spoken Content → Voices → English → pick a voice marked <b>Enhanced</b> or <b>Premium</b> (like Ava or
              Evan) and download it. Then close and reopen LineOS and pick it here.
            </p>
          </div>
        </details>
      )}

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
