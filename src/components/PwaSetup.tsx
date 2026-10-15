"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Android/Chrome fires beforeinstallprompt once, early; keep it for the Install button.
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Automatic updates: register the service worker, check for a new version when the app
 * opens, comes back to the front, or every 30 minutes; when a new version has taken over,
 * reload the next time the app is brought back (the job was saved when it went to the
 * background, so nothing is lost and nobody has to tap "update").
 */
function autoUpdate(): () => void {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  let reg: ServiceWorkerRegistration | null = null;
  let updateReady = false;
  sw.register("/sw.js")
    .then((r) => {
      reg = r;
    })
    .catch(() => {});
  const check = () => {
    if (navigator.onLine) reg?.update().catch(() => {});
  };
  const onControllerChange = () => {
    // First install takes control without needing a reload.
    if (!hadController) return;
    updateReady = true;
    if (document.visibilityState === "hidden") window.location.reload();
  };
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    if (updateReady) window.location.reload();
    else check();
  };
  sw.addEventListener("controllerchange", onControllerChange);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", check);
  const timer = setInterval(check, CHECK_EVERY_MS);
  return () => {
    sw.removeEventListener("controllerchange", onControllerChange);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", check);
    clearInterval(timer);
  };
}

/** Registers the offline service worker (production builds only) and keeps it updated. */
export function PwaSetup() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPrompt;
      notify();
    };
    const onInstalled = () => {
      deferred = null;
      notify();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const cleanups: (() => void)[] = [];
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      cleanups.push(autoUpdate());
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      cleanups.forEach((c) => c());
    };
  }, []);
  return null;
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** "Install app" on Android/Chrome; Add-to-Home-Screen steps on iPhone; nothing once installed. */
export function InstallApp() {
  const [, force] = useState(0);
  const [state, setState] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setState({ standalone: isStandalone(), ios: /iphone|ipad|ipod/i.test(navigator.userAgent) });
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!state || state.standalone) return null;
  if (deferred) {
    return (
      <button
        className="btn-primary"
        onClick={async () => {
          await deferred?.prompt();
          deferred = null;
          notify();
        }}
      >
        📲 Install LineOS on this phone
      </button>
    );
  }
  if (state.ios) {
    return (
      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        📲 To install on iPhone: tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b>. Then open LineOS from
        the home screen — it works with no signal.
      </p>
    );
  }
  return null;
}
