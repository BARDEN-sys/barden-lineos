"use client";

import { useEffect, useRef, useState } from "react";

// Minimal Web Speech API typing (Chrome/Android and Safari/iOS ship it prefixed).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function makeRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Tap to talk, tap again (or pause) to stop. Calls onText with the final transcript.
 * When the browser has no speech recognition, it says to use the keyboard's mic key,
 * which every phone keyboard has.
 */
export function VoiceButton({ onText, label = "Speak" }: { onText: (text: string) => void; label?: string }) {
  const recRef = useRef<Recognition | null>(null);
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(!!makeRecognition());
    return () => recRef.current?.stop();
  }, []);

  function start() {
    const rec = makeRecognition();
    if (!rec) return setSupported(false);
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setHeard((finalText + interim).trim());
    };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission is off for this site." : `Voice error: ${e.error}`);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) onText(finalText.trim());
    };
    setError(null);
    setHeard("");
    setListening(true);
    rec.start();
  }

  if (!supported) return <p className="text-xs text-slate-500">Voice: use the mic key on your phone keyboard.</p>;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={`btn border ${listening ? "animate-pulse border-red-500 bg-red-600 text-white" : "border-slate-300 bg-white"}`}
        onClick={() => (listening ? recRef.current?.stop() : start())}
        aria-pressed={listening}
      >
        🎤 {listening ? "Listening… tap to stop" : label}
      </button>
      {heard && <p className="text-xs text-slate-600">Heard: “{heard}”</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
