-- Google Earth runs imported on a shared project (.kml / .kmz), so the whole crew sees the
-- runs, the map-vs-printed flags and who signed off the printed footage.
-- Same shape and rules as marks: everyone on the project reads and writes, soft delete,
-- created_by / updated_by stamped by the server.

create table public.kml_runs (
  id text primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index on public.kml_runs (job_id);

create trigger kml_runs_stamp before insert or update on public.kml_runs for each row execute function public.stamp_update();

alter table public.kml_runs enable row level security;
create policy kml_runs_rw on public.kml_runs for all to authenticated using (public.job_role(job_id) is not null) with check (public.job_role(job_id) is not null);

alter publication supabase_realtime add table public.kml_runs;
