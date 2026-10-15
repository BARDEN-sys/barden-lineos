# LineOS Supabase project

Separate Supabase project for LineOS only (no shared database with other BARDEN apps).
Project ref: `klvkehiasgkteprmxihs` (https://klvkehiasgkteprmxihs.supabase.co).

Migrations in `migrations/` were applied in order. They create:

- `profiles`, `crews`, `crew_members` (role foreman | crew), `jobs`, `job_members`, `invites`
- shared crew work: `marks`, `overrides`, `daily_entries`, `photos` (soft delete, audit stamps)
- row level security: users only see projects they belong to; only a foreman changes the
  project (master totals, task codes) or invites; crew can mark, bill daily rows, add photos
- server-side master check: a daily row or locked override that would put a code over master
  is rejected with `LINEOS_OVER_MASTER: … Already billed by: <names>`
- `invite_preview(token)` (anyone) and `accept_invite(token)` (signed in)
- private storage buckets `prints` and `photos`, keyed by project id
- realtime on jobs, marks, overrides, daily_entries, photos
