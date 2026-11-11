-- Remove privileges that bypass RLS (notably TRUNCATE) and implicit RPC access.
revoke create on schema public from public, anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select,insert,update on public.workspaces,public.notes to authenticated;
grant select,insert on public.activities,public.note_entries to authenticated;
grant update(title,description,archived,category_attributes) on public.activities to authenticated;
grant select,insert,delete on public.attachments to authenticated;
grant select on public.activity_events,public.audit_logs,public.priority_history,public.workspace_events to authenticated;
grant select,delete on public.workspace_observations to authenticated;
grant insert(workspace_id,content),update(content) on public.workspace_observations to authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
-- Trigger functions are invoked by triggers, never by client RPCs.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype loop
  execute format('revoke execute on function %s from authenticated', f.signature);
 end loop;
 -- Put pg_temp last: implicit pg_temp precedence must not shadow relations.
 for f in select p.oid::regprocedure as signature from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
  execute format('alter function %s set search_path = pg_catalog, public, pg_temp', f.signature);
 end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
