-- Apply only after rolling back the frontend. No rows or columns are dropped.
begin;
create or replace function public.stamp() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 if TG_OP='INSERT' then new.created_at=clock_timestamp(); new.updated_at=new.created_at;
 else
  new.created_at=old.created_at;
  if new.owner_id<>old.owner_id then raise exception 'Owner cannot change'; end if;
  new.updated_at=clock_timestamp();
 end if;
 return new;
end $$;
create or replace function public.save_entry(p_id uuid,p_content text,p_revision integer) returns public.note_entries
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e note_entries; begin
 update note_entries set content=p_content,revision=revision+1 where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into e;
 if not found then raise exception 'Conflict: reload entry before saving'; end if;
 update notes set updated_at=now() where id=e.note_id;
 return e;
end $$;
create or replace function public.set_priority(p_activity uuid,p_urgent boolean,p_important boolean) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a activities;
begin
 select * into a from activities where id=p_activity and owner_id=auth.uid() for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if a.archived then raise exception 'Archived activity'; end if;
 if not exists(select 1 from workspaces where id=a.workspace_id and category='work') then raise exception 'Workspace unavailable'; end if;
 update activities set category_attributes=jsonb_set(category_attributes,'{work}',coalesce(category_attributes->'work','{"hasScheduledDate":false,"scheduledDate":null,"scheduledTime":null}'::jsonb)||jsonb_build_object('isUrgent',p_urgent,'isImportant',p_important)) where id=a.id;
end $$;
create or replace function public.edit_observation(p_id uuid,p_content text,p_expected text) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e activity_events;
begin
 select * into e from activity_events where id=p_id and owner_id=auth.uid() and type='observation' for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if e.content is distinct from p_expected then raise exception 'Conflict'; end if;
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
 update activities set status=target where id=a.id;
 return e;
end $$;
create or replace function public.search_all(p_query text,p_workspace uuid default null,p_kind text default null,p_status text default null,p_from timestamptz default null,p_to timestamptz default null,p_mime text default null,p_offset integer default 0)
returns table(id uuid,workspace_id uuid,parent_id uuid,kind text,title text,excerpt text,created_at timestamptz,status text,mime text)
language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 with results as (
 select w.id,w.id workspace_id,w.id parent_id,'workspace' kind,w.name title,w.description excerpt,w.created_at,null::text status,null::text mime from workspaces w where to_tsvector('portuguese',w.name || ' ' || w.description) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(w.name || ' ' || w.description),lower(trim(p_query)))>0
 union all select a.id,a.workspace_id,a.id,'activity',a.title,a.description,a.created_at,a.status::text,null from activities a where to_tsvector('portuguese',a.title || ' ' || a.description) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(a.title || ' ' || a.description),lower(trim(p_query)))>0
 union all select e.id,a.workspace_id,a.id,'event',a.title,e.content,e.created_at,a.status::text,null from activity_events e join activities a on a.id=e.activity_id where to_tsvector('portuguese',e.content) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(e.content),lower(trim(p_query)))>0
 union all select o.id,o.workspace_id,o.workspace_id,'workspace_observation',w.name,o.content,o.created_at,null,null from workspace_observations o join workspaces w on w.id=o.workspace_id where to_tsvector('portuguese',o.content) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(o.content),lower(trim(p_query)))>0
 union all select n.id,n.workspace_id,n.id,'note',n.title,'',n.created_at,null,null from notes n where to_tsvector('portuguese',n.title) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(n.title),lower(trim(p_query)))>0
 union all select e.id,n.workspace_id,n.id,'entry',n.title,e.content,e.created_at,null,null from note_entries e join notes n on n.id=e.note_id where to_tsvector('portuguese',e.content) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(e.content),lower(trim(p_query)))>0
 union all select f.id,coalesce(a.workspace_id,n.workspace_id),coalesce(a.id,n.id),'file',f.name,case when a.id is not null then 'activity' else 'note' end,f.created_at,a.status::text,f.mime from attachments f left join activities a on a.id=f.activity_id left join notes n on n.id=f.note_id where to_tsvector('portuguese',regexp_replace(f.name,'[^[:alnum:]]',' ','g')) @@ websearch_to_tsquery('portuguese',p_query) or strpos(lower(f.name),lower(trim(p_query)))>0
 ) select r.id,r.workspace_id,r.parent_id,r.kind,r.title,left(r.excerpt,300),r.created_at,r.status,r.mime from results r
 where length(trim(p_query))>0 and (p_workspace is null or r.workspace_id=p_workspace) and (p_kind is null or r.kind=p_kind) and (p_status is null or r.status=p_status) and (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<=p_to) and (p_mime is null or r.mime=p_mime)
 order by r.created_at desc,r.id limit 50 offset greatest(p_offset,0);
$$;
do $$ declare t text; begin
 foreach t in array array['workspaces','activities','activity_events','notes','note_entries','attachments'] loop
 execute format('drop trigger audit on public.%I',t);execute format('drop trigger audit_update on public.%I',t);
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()',t);
 end loop;
 foreach t in array array['activities','workspace_observations','notes'] loop
 execute format('drop trigger touch_parent on public.%I',t);execute format('drop trigger touch_parent_update on public.%I',t);
 execute format('create trigger touch_parent after insert or update or delete on public.%I for each row execute function public.touch_parent_workspace()',t);
 end loop;
 foreach t in array array['activities','activity_events','workspace_observations'] loop
 execute format('drop trigger workspace_event on public.%I',t);execute format('drop trigger workspace_event_update on public.%I',t);
 execute format('create trigger workspace_event after insert or update %s on public.%I for each row execute function public.record_workspace_event()',case when t='activities' then '' else 'or delete' end,t);
 end loop;
end $$;
commit;
-- New read/export APIs, indexes and derived search_document columns can remain unused safely.
