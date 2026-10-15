-- BARDEN LineOS: crews, projects (jobs), shared marks/daily rows/overrides/photos, invites.
-- Every crew-made record carries created_by / updated_by for the audit trail.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('foreman', 'crew')),
  added_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create table public.jobs (
  id text primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  header jsonb not null default '{}'::jsonb,
  master jsonb not null default '[]'::jsonb,
  glossary jsonb not null default '[]'::jsonb,
  sheets jsonb not null default '[]'::jsonb,
  pdf_name text,
  pdf_path text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.job_members (
  job_id text not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('foreman', 'crew')),
  added_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

create table public.marks (
  id text primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  sheet_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.overrides (
  job_id text not null references public.jobs(id) on delete cascade,
  sheet_id text not null,
  code text not null,
  qty integer not null check (qty >= 0),
  locked boolean not null default true,
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (job_id, sheet_id, code)
);

create table public.daily_entries (
  id text primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  unit_code text not null,
  qty integer not null check (qty >= 0),
  data jsonb not null,
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.photos (
  id text primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  sheet_id text,
  kind text not null default 'markup',
  storage_path text not null,
  width integer,
  height integer,
  taken_at timestamptz not null default now(),
  deleted boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  crew_id uuid not null references public.crews(id) on delete cascade,
  job_id text references public.jobs(id) on delete cascade,
  role text not null default 'crew' check (role in ('foreman', 'crew')),
  email text,
  phone text,
  label text,
  multi_use boolean not null default false,
  invited_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  accepted_count integer not null default 0,
  revoked_at timestamptz
);

create index on public.crew_members (user_id);
create index on public.job_members (user_id);
create index on public.jobs (crew_id);
create index on public.marks (job_id);
create index on public.daily_entries (job_id, unit_code);
create index on public.photos (job_id);
create index on public.invites (crew_id);

-- ---------- Roles ----------
create or replace function public.crew_role(p_crew uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from crew_members where crew_id = p_crew and user_id = auth.uid()
$$;

-- Foreman of the crew, or foreman on that one project, wins over crew.
create or replace function public.job_role(p_job text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when bool_or(r = 'foreman') then 'foreman'
    when count(*) > 0 then 'crew'
  end
  from (
    select cm.role as r from jobs j join crew_members cm on cm.crew_id = j.crew_id and cm.user_id = auth.uid() where j.id = p_job
    union all
    select jm.role from job_members jm where jm.job_id = p_job and jm.user_id = auth.uid()
  ) roles
$$;

-- ---------- Profiles ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, phone) values (new.id, new.email, new.phone) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- The person who creates a crew is its foreman.
create or replace function public.add_crew_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into crew_members (crew_id, user_id, role) values (new.id, new.created_by, 'foreman') on conflict do nothing;
  return new;
end $$;
create trigger crews_add_creator after insert on public.crews for each row execute function public.add_crew_creator();

-- Audit trail: who changed a row and when (cannot be faked by the client).
create or replace function public.stamp_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger jobs_stamp before insert or update on public.jobs for each row execute function public.stamp_update();
create trigger marks_stamp before insert or update on public.marks for each row execute function public.stamp_update();
create trigger overrides_stamp before insert or update on public.overrides for each row execute function public.stamp_update();
create trigger daily_stamp before insert or update on public.daily_entries for each row execute function public.stamp_update();

create or replace function public.stamp_photo() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); else new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger photos_stamp before insert or update on public.photos for each row execute function public.stamp_photo();

-- ---------- Master total check across ALL crew edits ----------
create or replace function public.master_qty(p_job text, p_code text) returns integer
language sql stable security definer set search_path = public as $$
  select (m->>'estQty')::int from jobs j, jsonb_array_elements(j.master) m where j.id = p_job and m->>'code' = p_code limit 1
$$;

create or replace function public.check_daily_master() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_master int;
  v_total int;
  v_who text;
begin
  if new.deleted then return new; end if;
  v_master := master_qty(new.job_id, new.unit_code);
  if v_master is null then
    raise exception 'LINEOS_NOT_IN_MASTER: % is not on the master list', new.unit_code using errcode = 'P0001';
  end if;
  select coalesce(sum(qty), 0) into v_total from daily_entries
   where job_id = new.job_id and unit_code = new.unit_code and not deleted and id <> new.id;
  if v_total + new.qty > v_master then
    select string_agg(distinct coalesce(p.display_name, p.email, p.phone, 'unknown'), ', ') into v_who
      from daily_entries d left join profiles p on p.id = coalesce(d.updated_by, d.created_by)
     where d.job_id = new.job_id and d.unit_code = new.unit_code and not d.deleted and d.id <> new.id;
    raise exception 'LINEOS_OVER_MASTER: % billed would be % vs master %. Already billed by: %. Max on this row is %.',
      new.unit_code, v_total + new.qty, v_master, coalesce(v_who, 'nobody'), greatest(0, v_master - v_total)
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger daily_master_check before insert or update on public.daily_entries for each row execute function public.check_daily_master();

create or replace function public.check_override_master() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_master int;
  v_total int;
  v_who text;
begin
  if new.deleted or not new.locked then return new; end if;
  v_master := master_qty(new.job_id, new.code);
  if v_master is null then
    raise exception 'LINEOS_NOT_IN_MASTER: % is not on the master list', new.code using errcode = 'P0001';
  end if;
  select coalesce(sum(qty), 0) into v_total from overrides
   where job_id = new.job_id and code = new.code and locked and not deleted and sheet_id <> new.sheet_id;
  if v_total + new.qty > v_master then
    select string_agg(distinct coalesce(p.display_name, p.email, p.phone, 'unknown'), ', ') into v_who
      from overrides o left join profiles p on p.id = coalesce(o.updated_by, o.created_by)
     where o.job_id = new.job_id and o.code = new.code and o.locked and not o.deleted and o.sheet_id <> new.sheet_id;
    raise exception 'LINEOS_OVER_MASTER: % locked would be % vs master %. Locked by: %. Max on this sheet is %.',
      new.code, v_total + new.qty, v_master, coalesce(v_who, 'nobody'), greatest(0, v_master - v_total)
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger overrides_master_check before insert or update on public.overrides for each row execute function public.check_override_master();

-- ---------- Invites ----------
-- What an invite is for, shown before signing in. Only harmless fields.
create or replace function public.invite_preview(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'crew', c.name,
    'project', case when i.job_id is null then null else coalesce(j.header->>'name', 'WO ' || coalesce(j.header->>'woNumber', '')) end,
    'role', i.role,
    'invited_by', coalesce(p.display_name, p.email, p.phone),
    'valid', i.revoked_at is null and i.expires_at > now() and (i.multi_use or i.accepted_at is null)
  )
  from invites i
  join crews c on c.id = i.crew_id
  left join jobs j on j.id = i.job_id
  left join profiles p on p.id = i.invited_by
  where i.token = p_token
$$;

create or replace function public.accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v invites%rowtype;
begin
  if auth.uid() is null then raise exception 'LINEOS_SIGN_IN: sign in first'; end if;
  select * into v from invites where token = p_token for update;
  if not found then raise exception 'LINEOS_INVITE: invite not found'; end if;
  if v.revoked_at is not null then raise exception 'LINEOS_INVITE: this invite was cancelled'; end if;
  if v.expires_at <= now() then raise exception 'LINEOS_INVITE: this invite has expired — ask for a new one'; end if;
  if not v.multi_use and v.accepted_at is not null and v.accepted_by <> auth.uid() then
    raise exception 'LINEOS_INVITE: this invite was already used';
  end if;
  if v.job_id is null then
    insert into crew_members (crew_id, user_id, role) values (v.crew_id, auth.uid(), v.role)
    on conflict (crew_id, user_id) do update set role = case when crew_members.role = 'foreman' then 'foreman' else excluded.role end;
  else
    insert into job_members (job_id, user_id, role) values (v.job_id, auth.uid(), v.role)
    on conflict (job_id, user_id) do update set role = case when job_members.role = 'foreman' then 'foreman' else excluded.role end;
  end if;
  update invites set accepted_by = auth.uid(), accepted_at = now(), accepted_count = accepted_count + 1 where id = v.id;
  return jsonb_build_object('crew_id', v.crew_id, 'job_id', v.job_id, 'role', v.role);
end $$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.jobs enable row level security;
alter table public.job_members enable row level security;
alter table public.marks enable row level security;
alter table public.overrides enable row level security;
alter table public.daily_entries enable row level security;
alter table public.photos enable row level security;
alter table public.invites enable row level security;

-- profiles: yourself, and people you share a crew or project with
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id where a.user_id = auth.uid() and b.user_id = profiles.id)
  or exists (
    select 1 from jobs j where public.job_role(j.id) is not null and (
      exists (select 1 from crew_members cm where cm.crew_id = j.crew_id and cm.user_id = profiles.id)
      or exists (select 1 from job_members jm where jm.job_id = j.id and jm.user_id = profiles.id)
    )
  )
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- crews
create policy crews_select on public.crews for select to authenticated using (public.crew_role(id) is not null or created_by = auth.uid());
create policy crews_insert on public.crews for insert to authenticated with check (created_by = auth.uid());
create policy crews_update on public.crews for update to authenticated using (public.crew_role(id) = 'foreman');
create policy crews_delete on public.crews for delete to authenticated using (public.crew_role(id) = 'foreman');

-- crew members: members see the crew list; the foreman adds/changes/removes; anyone can leave
create policy crew_members_select on public.crew_members for select to authenticated using (public.crew_role(crew_id) is not null);
create policy crew_members_insert on public.crew_members for insert to authenticated with check (public.crew_role(crew_id) = 'foreman');
create policy crew_members_update on public.crew_members for update to authenticated using (public.crew_role(crew_id) = 'foreman');
create policy crew_members_delete on public.crew_members for delete to authenticated using (public.crew_role(crew_id) = 'foreman' or user_id = auth.uid());

-- projects: members see; only a foreman creates or changes them (master totals, task codes, sheets)
create policy jobs_select on public.jobs for select to authenticated using (public.job_role(id) is not null);
create policy jobs_insert on public.jobs for insert to authenticated with check (public.crew_role(crew_id) = 'foreman');
create policy jobs_update on public.jobs for update to authenticated using (public.job_role(id) = 'foreman') with check (public.crew_role(crew_id) = 'foreman' or public.job_role(id) = 'foreman');
create policy jobs_delete on public.jobs for delete to authenticated using (public.crew_role(crew_id) = 'foreman');

create policy job_members_select on public.job_members for select to authenticated using (public.job_role(job_id) is not null);
create policy job_members_write on public.job_members for all to authenticated using (public.job_role(job_id) = 'foreman') with check (public.job_role(job_id) = 'foreman');
create policy job_members_leave on public.job_members for delete to authenticated using (user_id = auth.uid());

-- crew work: everyone on the project can read and write
create policy marks_rw on public.marks for all to authenticated using (public.job_role(job_id) is not null) with check (public.job_role(job_id) is not null);
create policy overrides_rw on public.overrides for all to authenticated using (public.job_role(job_id) is not null) with check (public.job_role(job_id) is not null);
create policy daily_rw on public.daily_entries for all to authenticated using (public.job_role(job_id) is not null) with check (public.job_role(job_id) is not null);
create policy photos_rw on public.photos for all to authenticated using (public.job_role(job_id) is not null) with check (public.job_role(job_id) is not null);

-- invites: the foreman of the crew (or of that project) manages them
create policy invites_select on public.invites for select to authenticated using (
  public.crew_role(crew_id) = 'foreman' or (job_id is not null and public.job_role(job_id) = 'foreman'));
create policy invites_insert on public.invites for insert to authenticated with check (
  invited_by = auth.uid() and (public.crew_role(crew_id) = 'foreman' or (job_id is not null and public.job_role(job_id) = 'foreman')));
create policy invites_update on public.invites for update to authenticated using (
  public.crew_role(crew_id) = 'foreman' or (job_id is not null and public.job_role(job_id) = 'foreman'));
create policy invites_delete on public.invites for delete to authenticated using (
  public.crew_role(crew_id) = 'foreman' or (job_id is not null and public.job_role(job_id) = 'foreman'));

-- ---------- Files: work prints and photos, private, by project ----------
insert into storage.buckets (id, name, public) values ('prints', 'prints', false), ('photos', 'photos', false)
on conflict (id) do nothing;

create policy lineos_files_read on storage.objects for select to authenticated using (
  bucket_id in ('prints', 'photos') and public.job_role(split_part(name, '/', 1)) is not null);
create policy lineos_photos_write on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and public.job_role(split_part(name, '/', 1)) is not null);
create policy lineos_prints_write on storage.objects for insert to authenticated with check (
  bucket_id = 'prints' and public.job_role(split_part(name, '/', 1)) = 'foreman');
create policy lineos_prints_update on storage.objects for update to authenticated using (
  bucket_id = 'prints' and public.job_role(split_part(name, '/', 1)) = 'foreman');

-- ---------- Live updates ----------
alter publication supabase_realtime add table public.jobs, public.marks, public.overrides, public.daily_entries, public.photos;
