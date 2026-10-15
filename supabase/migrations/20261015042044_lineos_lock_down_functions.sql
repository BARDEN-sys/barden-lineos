alter function public.stamp_update() set search_path = public;
alter function public.stamp_photo() set search_path = public;

-- Trigger-only functions: nobody calls them over the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_crew_creator() from public, anon, authenticated;
revoke execute on function public.check_daily_master() from public, anon, authenticated;
revoke execute on function public.check_override_master() from public, anon, authenticated;
revoke execute on function public.stamp_update() from public, anon, authenticated;
revoke execute on function public.stamp_photo() from public, anon, authenticated;
revoke execute on function public.master_qty(text, text) from public, anon, authenticated;

-- Role helpers are used by row-level security for signed-in users only.
revoke execute on function public.crew_role(uuid) from public, anon;
revoke execute on function public.job_role(text) from public, anon;
grant execute on function public.crew_role(uuid) to authenticated;
grant execute on function public.job_role(text) to authenticated;
