"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { normalizeContact, useAuth } from "@/components/AuthProvider";
import { useJob } from "@/components/JobProvider";
import { SignIn } from "@/components/SignIn";
import {
  cancelInvite,
  createCrew,
  createInvite,
  crewMembers,
  inviteUrl,
  listInvites,
  markInviteSent,
  myCrews,
  removeMember,
  setMemberRole,
  type Crew,
  type Invite,
  type Member,
} from "@/lib/cloud";
import type { CrewRole } from "@/lib/types";

const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

function inviteText(from: string, what: string, url: string) {
  return `${from} invited you to ${what} on BARDEN LineOS. Tap to join: ${url}`;
}

/** Opens the phone's own Messages app with the invite filled in (free, uses your texting). */
function openText(phone: string | null, body: string) {
  const to = phone ? normalizeContact(phone).value : "";
  window.location.href = `sms:${to}${isIOS() ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/** Opens the phone's own Mail app with the invite filled in. */
function openEmail(email: string | null, subject: string, body: string) {
  window.location.href = `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function CrewPage() {
  const { userId, profile, displayName } = useAuth();
  const { job, shareWith, isForeman, syncNow } = useJob();
  const signedIn = !!userId && !!profile?.display_name;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-6 pb-16">
      <header className="flex items-center gap-3">
        <Link href={job ? "/job" : "/"} className="btn-ghost min-h-9 px-3 text-sm">← Back</Link>
        <h1 className="text-xl font-black">Crew &amp; invites</h1>
      </header>
      {!signedIn ? (
        <SignIn title="Sign in to share projects and invite your crew" />
      ) : !job ? (
        <p className="card text-sm text-slate-600">Open a project first, then come back here to share it and invite the crew.</p>
      ) : !job.cloud ? (
        <ShareProject onShare={async (crew) => { await shareWith(crew); syncNow(); }} userId={userId!} projectName={job.header.name || `WO ${job.header.woNumber}`} />
      ) : (
        <CrewManager
          crewId={job.cloud.crewId}
          crewName={job.cloud.crewName ?? "Crew"}
          jobId={job.id}
          projectName={job.header.name ? `${job.header.name} (WO ${job.header.woNumber})` : `WO ${job.header.woNumber}`}
          isForeman={isForeman}
          userId={userId!}
          myName={displayName}
        />
      )}
    </main>
  );
}

function ShareProject({ onShare, userId, projectName }: { onShare: (c: Crew) => Promise<void>; userId: string; projectName: string }) {
  const [crews, setCrews] = useState<Crew[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myCrews(userId)
      .then((c) => {
        const mine = c.filter((x) => x.role === "foreman");
        setCrews(mine);
        setPick(mine[0]?.id ?? "new");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [userId]);

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-lg font-bold">Share {projectName} with a crew</h2>
      <p className="text-sm text-slate-600">
        Once shared, everyone you invite sees the same sheets, marks, daily rows and totals. Work done with no signal
        uploads when the phone is back online.
      </p>
      {crews === null && !error && <p className="text-sm text-slate-500">Loading your crews…</p>}
      {crews && (
        <div className="flex flex-col gap-2">
          {crews.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="radio" name="crew" checked={pick === c.id} onChange={() => setPick(c.id)} /> {c.name}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="radio" name="crew" checked={pick === "new"} onChange={() => setPick("new")} /> New crew
          </label>
          {pick === "new" && <input className="input" placeholder="Crew name, e.g. BARDEN Line Crew 1" value={newName} onChange={(e) => setNewName(e.target.value)} />}
        </div>
      )}
      <button
        className="btn-primary"
        disabled={busy || !crews || (pick === "new" && !newName.trim())}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const crew = pick === "new" ? await createCrew(newName, userId) : crews!.find((c) => c.id === pick)!;
            await onShare(crew);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Sharing…" : "Share project"}
      </button>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function CrewManager(props: { crewId: string; crewName: string; jobId: string; projectName: string; isForeman: boolean; userId: string; myName: string }) {
  const { crewId, crewName, jobId, projectName, isForeman, userId, myName } = props;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMembers(await crewMembers(crewId, jobId));
      if (isForeman) setInvites(await listInvites(crewId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [crewId, jobId, isForeman]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = invites.filter((i) => !i.revoked_at && (i.multi_use || !i.accepted_at) && new Date(i.expires_at) > new Date());

  return (
    <>
      <section className="card">
        <p className="text-sm text-slate-500">Shared with crew</p>
        <p className="text-lg font-bold">{crewName}</p>
        <p className="text-sm text-slate-600">{projectName}</p>
      </section>

      {isForeman ? (
        <InviteForm crewId={crewId} jobId={jobId} crewName={crewName} projectName={projectName} userId={userId} myName={myName} onSent={(msg) => { setNotice(msg); void refresh(); }} />
      ) : (
        <p className="card text-sm text-slate-600">Only the foreman can invite people or change roles.</p>
      )}
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

      <section className="card flex flex-col gap-2">
        <h2 className="font-bold">People ({members.length})</h2>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.userId + m.scope} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {m.name} {m.userId === userId && <span className="text-xs font-normal text-slate-500">(you)</span>}
                </span>
                <span className="block text-xs text-slate-500">
                  {m.scope === "crew" ? "Whole crew" : "This project only"}
                  {m.phone ? ` · ${m.phone}` : m.email ? ` · ${m.email}` : ""}
                </span>
              </span>
              {isForeman && m.userId !== userId ? (
                <>
                  <select
                    className="input min-h-9 w-32"
                    value={m.role}
                    aria-label={`Role for ${m.name}`}
                    onChange={async (e) => {
                      try {
                        await setMemberRole(m, crewId, jobId, e.target.value as CrewRole);
                        await refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    <option value="crew">Crew</option>
                    <option value="foreman">Foreman</option>
                  </select>
                  <button
                    className="btn min-h-9 px-2 text-red-700"
                    aria-label={`Remove ${m.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${m.name}? They lose access right away.`)) return;
                      try {
                        await removeMember(m, crewId, jobId);
                        await refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="chip border-slate-300">{m.role === "foreman" ? "Foreman" : "Crew"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isForeman && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-bold">Pending invites ({pending.length})</h2>
          {!pending.length && <p className="text-sm text-slate-500">None.</p>}
          <ul className="divide-y divide-slate-100">
            {pending.map((i) => {
              const what = i.job_id ? projectName : `the ${crewName} crew`;
              const body = inviteText(myName, what, inviteUrl(i.token));
              return (
                <li key={i.id} className="flex flex-col gap-2 py-2">
                  <span className="text-sm">
                    <b>{i.label || i.phone || i.email || (i.multi_use ? "Truck QR / shared link" : "Invite link")}</b>
                    <span className="block text-xs text-slate-500">
                      {i.job_id ? "This project" : "Whole crew"} · {i.role === "foreman" ? "Foreman" : "Crew"} · sent{" "}
                      {new Date(i.last_sent_at).toLocaleDateString()}
                      {i.multi_use && i.accepted_count > 0 ? ` · used ${i.accepted_count}×` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button
                      className="btn-ghost min-h-9"
                      onClick={async () => {
                        await markInviteSent(i.id).catch(() => {});
                        if (i.email && !i.phone) openEmail(i.email, "Join the crew on BARDEN LineOS", body);
                        else openText(i.phone, body);
                      }}
                    >
                      Resend
                    </button>
                    <button
                      className="btn-ghost min-h-9"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteUrl(i.token));
                          setNotice("Link copied.");
                        } catch {
                          setNotice(inviteUrl(i.token));
                        }
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      className="btn-danger min-h-9"
                      onClick={async () => {
                        try {
                          await cancelInvite(i.id);
                          await refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </>
  );
}

function InviteForm(props: { crewId: string; jobId: string; crewName: string; projectName: string; userId: string; myName: string; onSent: (msg: string) => void }) {
  const { crewId, jobId, crewName, projectName, userId, myName, onSent } = props;
  const [contact, setContact] = useState("");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"crew" | "project">("crew");
  const [role, setRole] = useState<CrewRole>("crew");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; img: string } | null>(null);

  const what = scope === "project" ? projectName : `the ${crewName} crew`;

  async function make(multiUse = false) {
    const c = contact.trim() ? normalizeContact(contact) : null;
    return createInvite({
      crewId,
      jobId: scope === "project" ? jobId : null,
      role: multiUse ? "crew" : role,
      email: c?.channel === "email" ? c.value : undefined,
      phone: c?.channel === "sms" ? c.value : undefined,
      label: label.trim() || undefined,
      multiUse,
      userId,
    });
  }

  async function send(via: "text" | "email") {
    setBusy(true);
    setError(null);
    try {
      const inv = await make();
      const body = inviteText(myName, what, inviteUrl(inv.token));
      if (via === "text") openText(inv.phone, body);
      else openEmail(inv.email, "Join the crew on BARDEN LineOS", body);
      onSent(`Invite created for ${label || contact || "a new person"}. Send the message that just opened.`);
      setContact("");
      setLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const c = contact.trim() ? normalizeContact(contact) : null;

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-lg font-bold">Invite someone</h2>
      <label className="flex flex-col gap-1 text-sm">
        Name (optional)
        <input className="input" placeholder="e.g. Carl" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Cell number or email
        <input className="input" inputMode="email" placeholder="(813) 555-0100 or carl@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Invite to
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as "crew" | "project")}>
            <option value="crew">Whole crew</option>
            <option value="project">This project only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          As
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as CrewRole)}>
            <option value="crew">Crew member</option>
            <option value="foreman">Foreman</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Crew members mark sheets, measure, add photos and daily rows. They can&apos;t change master totals or export final sheets.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={busy || c?.channel === "email"} onClick={() => send("text")}>
          💬 Send by text
        </button>
        <button className="btn-ghost flex-1" disabled={busy || c?.channel === "sms"} onClick={() => send("email")}>
          ✉️ Send by email
        </button>
      </div>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const inv = await make(true);
            const url = inviteUrl(inv.token);
            setQr({ url, img: await QRCode.toDataURL(url, { width: 480, margin: 1 }) });
            onSent("Truck QR code ready. Anyone who scans it joins as crew; cancel it under Pending invites when done.");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        🔳 QR code for the truck
      </button>
      {qr && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.img} alt="Invite QR code" className="h-60 w-60" />
          <p className="text-center text-xs text-slate-500">Scan with the phone camera to join {what} as crew.</p>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
