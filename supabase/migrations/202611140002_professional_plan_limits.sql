-- The professional plan tables (202611140001) were created after the account
-- limits (202611130001) and are written directly by signed-in clients like the
-- other tables. They get the same per-account rate ceiling and their own row
-- ceilings. Everything else in the function is unchanged. Safe to run more
-- than once.
create or replace function public.enforce_account_limits() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid := auth.uid(); cap integer; total integer;
begin
 -- Rows changed by other triggers belong to a request that was already counted.
 if actor is null or pg_trigger_depth()>1 then
  if TG_OP='DELETE' then return old; else return new; end if;
 end if;
 -- audit_logs holds one row per changed record, including cascaded ones.
 select count(*) into total from (
  select 1 from public.audit_logs
  where owner_id=actor and created_at>clock_timestamp()-interval '1 minute' limit 1201) recent;
 if total>1200 then raise exception 'Too many requests'; end if;
 if TG_OP='INSERT' then
  cap=case TG_TABLE_NAME
   when 'workspaces' then 200
   when 'activities' then 10000
   when 'notes' then 2000
   when 'note_entries' then 20000
   when 'workspace_observations' then 20000
   when 'career_targets' then 1000
   when 'professional_development_items' then 5000 end;
  if cap is not null then
   perform pg_advisory_xact_lock(hashtextextended(actor::text,17895));
   execute format('select count(*) from (select 1 from public.%I where owner_id=$1 limit $2) existing',TG_TABLE_NAME)
    into total using actor,cap;
   if total>=cap then raise exception 'Account limit reached'; end if;
  end if;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.enforce_account_limits() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['career_targets','professional_development_items'] loop
  execute format('drop trigger if exists account_limits on public.%I',t);
  execute format('create trigger account_limits before insert or update or delete on public.%I for each row execute function public.enforce_account_limits()',t);
 end loop;
end $$;
