-- Identical values are not new factual edits. Locks and expected revisions remain mandatory.
create or replace function public.stamp() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 if TG_OP='INSERT' then new.created_at=clock_timestamp(); new.updated_at=new.created_at;
 else
  new.created_at=old.created_at;
  if new.owner_id<>old.owner_id then raise exception 'Owner cannot change'; end if;
  if (to_jsonb(new)-array['updated_at','search_document']) is distinct from (to_jsonb(old)-array['updated_at','search_document']) or new.updated_at is distinct from old.updated_at then
    new.updated_at=clock_timestamp();
  else new.updated_at=old.updated_at; end if;
 end if;
 return new;
end $$;
create or replace function public.save_entry(p_id uuid,p_content text,p_revision integer) returns public.note_entries
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e note_entries; begin
 select * into e from note_entries where id=p_id and owner_id=auth.uid() and revision=p_revision for update;
 if not found then raise exception 'Conflict: reload entry before saving'; end if;
 if e.content is not distinct from p_content then return e; end if;
 update note_entries set content=p_content,revision=revision+1 where id=e.id returning * into e;
 update notes set updated_at=clock_timestamp() where id=e.note_id;
 return e;
end $$;

create or replace function public.set_priority(p_activity uuid,p_urgent boolean,p_important boolean) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a activities;
begin
 select * into a from activities where id=p_activity and owner_id=auth.uid() for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if a.archived then raise exception 'Archived activity'; end if;
 if not exists(select 1 from workspaces where id=a.workspace_id and category='work') then raise exception 'Workspace unavailable'; end if;
 if (a.category_attributes#>>'{work,isUrgent}')::boolean is not distinct from p_urgent and (a.category_attributes#>>'{work,isImportant}')::boolean is not distinct from p_important then return; end if;
 update activities set category_attributes=jsonb_set(category_attributes,'{work}',coalesce(category_attributes->'work','{"hasScheduledDate":false,"scheduledDate":null,"scheduledTime":null}'::jsonb)||jsonb_build_object('isUrgent',p_urgent,'isImportant',p_important)) where id=a.id;
end $$;

create or replace function public.edit_observation(p_id uuid,p_content text,p_expected text) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e activity_events;
begin
 select * into e from activity_events where id=p_id and owner_id=auth.uid() and type='observation' for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if e.content is distinct from p_expected then raise exception 'Conflict'; end if;
 if e.content is not distinct from trim(p_content) then return; end if;
 update activity_events set content=trim(p_content),edited_at=clock_timestamp() where id=e.id;
 update activities set updated_at=clock_timestamp() where id=e.activity_id;
end $$;

create or replace function public.add_event(p_activity uuid,p_type public.event_type,p_content text,p_request uuid) returns public.activity_events
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a activities; e activity_events; target activity_status;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 17893));
 select * into a from activities where id=p_activity and owner_id=auth.uid() for update;
 if not found then raise exception 'Activity unavailable'; end if;
 select * into e from activity_events where owner_id=auth.uid() and request_id=p_request;
 if found then
 if e.activity_id<>p_activity or e.type<>p_type or e.content<>trim(p_content) then raise exception 'Request conflict'; end if;
 return e; end if;
 if a.archived then raise exception 'Archived activity'; end if;
 target=case
 when p_type='check_in' and a.status='not_started' then 'in_progress'::activity_status
 when p_type='pause' and a.status='in_progress' then 'paused'::activity_status
 when p_type='resume' and a.status in ('paused','completed') then 'in_progress'::activity_status
 when p_type='check_out' and a.status in ('in_progress','paused') then 'completed'::activity_status
 when p_type='observation' then a.status else null end;
 if target is null then raise exception 'Invalid transition'; end if;
 if (select count(*) from activity_events where owner_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60 then raise exception 'Too many events'; end if;
 insert into activity_events(activity_id,owner_id,type,content,request_id,created_at) values(a.id,auth.uid(),p_type,trim(p_content),p_request,clock_timestamp()) returning * into e;
 update activities set status=target,updated_at=clock_timestamp() where id=a.id;
 return e;
end $$;


-- Preserve UPDATE RETURNING, but avoid parent writes/audits when every stored value is unchanged.
do $$ declare t text; begin
 foreach t in array array['workspaces','activities','activity_events','notes','note_entries','attachments'] loop
  execute format('drop trigger audit on public.%I',t);
  execute format('create trigger audit after insert or delete on public.%I for each row execute function public.audit()',t);
  execute format('create trigger audit_update after update on public.%I for each row when (old.* is distinct from new.*) execute function public.audit()',t);
 end loop;
 foreach t in array array['activities','workspace_observations','notes'] loop
  execute format('drop trigger touch_parent on public.%I',t);
  execute format('create trigger touch_parent after insert or delete on public.%I for each row execute function public.touch_parent_workspace()',t);
  execute format('create trigger touch_parent_update after update on public.%I for each row when (old.* is distinct from new.*) execute function public.touch_parent_workspace()',t);
 end loop;
 foreach t in array array['activities','activity_events','workspace_observations'] loop
  execute format('drop trigger workspace_event on public.%I',t);
  if t='activities' then
   execute format('create trigger workspace_event after insert on public.%I for each row execute function public.record_workspace_event()',t);
  else
   execute format('create trigger workspace_event after insert or delete on public.%I for each row execute function public.record_workspace_event()',t);
  end if;
  execute format('create trigger workspace_event_update after update on public.%I for each row when (old.* is distinct from new.*) execute function public.record_workspace_event()',t);
 end loop;
end $$;
