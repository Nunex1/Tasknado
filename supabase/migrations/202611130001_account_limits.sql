-- Per-account ceilings on what a signed-in client can create and on how fast it
-- can change data. Until now only activity events (60/minute) and uploads had a
-- limit: every other table accepted unlimited rows from any account.
--
-- These are abuse speed bumps, not accounting. The rate is counted without
-- locks, so it cannot deadlock with the row locks taken by the RPCs; under
-- concurrency an account may exceed it by at most its number of simultaneous
-- requests. Row ceilings are exact: inserts of one account queue on an advisory
-- lock, which is always the first lock those transactions take.
-- Trusted backends (no user JWT) are not limited. Safe to run more than once.

-- Observations were the only client-writable table without an audit trail.
drop trigger if exists audit on public.workspace_observations;
create trigger audit after insert or update or delete on public.workspace_observations
 for each row execute function public.audit();
create index if not exists workspace_observations_owner on public.workspace_observations(owner_id);

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
   when 'workspace_observations' then 20000 end;
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
 foreach t in array array['workspaces','activities','notes','note_entries','workspace_observations'] loop
  execute format('drop trigger if exists account_limits on public.%I',t);
  execute format('create trigger account_limits before insert or update or delete on public.%I for each row execute function public.enforce_account_limits()',t);
 end loop;
end $$;
-- Event inserts keep their own exact limit in add_event. Edits and deletions of
-- observations write history snapshots, so they count against the rate as well.
drop trigger if exists account_limits on public.activity_events;
create trigger account_limits before update or delete on public.activity_events
 for each row execute function public.enforce_account_limits();
