# Addendum — crew invites (build in M4)

M1 keeps the data model ready: `jobId` and `createdBy` (+ `createdAt`) on every mark and override.
No auth in demo mode.

## Roles
- **Foreman/Owner:** creates jobs, uploads print + master list, invites crew, approves final
  allocation and export.
- **Crew member:** views assigned jobs, marks highlights, measures (map/GPS), adds photos. Cannot
  change master totals or approve export.

## Invites
- By email or by text link (share link / QR code for the truck).
- To the whole crew or to a single job.
- Foreman can remove a member or change their role anytime.
- Pending invites list with resend/cancel.

## Shared work
- Everyone on a job sees the same sheets, marks and totals live.
- Every mark/edit shows who made it and when (audit trail).
- Master total check applies across ALL crew edits. If two people push a code over master, block
  it and show who is over (`CodeAllocation.overBy` already reports this).

## M4 tech
- Supabase auth (email magic link + phone/SMS). Tables: crews, crew_members (role), jobs,
  job_members, invites. RLS so users only see jobs they belong to.
- Separate Supabase project for LineOS only.

## Done when
Foreman invites a second account, it joins the job, marks a sheet, and the foreman sees the
change; a crew account cannot edit master qty or export.
