create extension if not exists pgcrypto;
create type public.activity_status as enum ('not_started','in_progress','paused','completed');
create type public.event_type as enum ('check_in','pause','resume','observation','check_out');
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=10000), icon text not null default 'folder' check(icon in ('folder','briefcase','book','wallet','code')),
 archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.activities (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 workspace_id uuid not null, title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=20000),
 status public.activity_status not null default 'not_started', archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id),
 foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade,
 check(not archived or status='completed')
);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 activity_id uuid not null, type public.event_type not null, content text not null check(length(trim(content)) between 1 and 20000),
 created_at timestamptz not null default now(), request_id uuid not null, unique(owner_id,request_id),
 foreign key(activity_id,owner_id) references public.activities(id,owner_id) on delete cascade
);
create table public.notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 workspace_id uuid not null, title text not null check(length(trim(title)) between 1 and 200),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id),
 foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade
);
create table public.note_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 note_id uuid not null, content text not null default '' check(length(content)<=50000), revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(note_id,owner_id) references public.notes(id,owner_id) on delete cascade
);
create table public.attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 activity_id uuid, note_id uuid, name text not null check(length(name) between 1 and 255), path text not null unique,
 mime text not null, size bigint not null check(size between 1 and 20971520), created_at timestamptz not null default now(),
 check(num_nonnulls(activity_id,note_id)=1), check(path=owner_id::text || '/' || id::text),
 foreign key(activity_id,owner_id) references public.activities(id,owner_id) on delete cascade,
 foreign key(note_id,owner_id) references public.notes(id,owner_id) on delete cascade,
 check(mime in ('application/pdf','image/png','image/jpeg','image/webp','video/mp4','video/webm','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'))
);
create table public.audit_logs (
 id bigint generated always as identity primary key, owner_id uuid not null references auth.users on delete cascade,
 entity text not null, entity_id uuid not null, action text not null, created_at timestamptz not null default now()
);

-- Server timestamps and audit trail. Clients cannot forge ownership or creation time.
create function public.stamp() returns trigger language plpgsql set search_path = public as $$
begin
 if TG_OP='INSERT' then new.created_at=clock_timestamp(); else new.created_at=old.created_at; end if;
 if TG_OP='UPDATE' and new.owner_id<>old.owner_id then raise exception 'Owner cannot change'; end if;
 new.updated_at=clock_timestamp(); return new;
end $$;
create function public.audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='DELETE' then insert into audit_logs(owner_id,entity,entity_id,action) values(old.owner_id,TG_TABLE_NAME,old.id,TG_OP); return old;
 else insert into audit_logs(owner_id,entity,entity_id,action) values(new.owner_id,TG_TABLE_NAME,new.id,TG_OP); return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['workspaces','activities','notes','note_entries'] loop
 execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp()',t);
 end loop;
 foreach t in array array['workspaces','activities','activity_events','notes','note_entries','attachments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()',t);
 end loop;
 foreach t in array array['workspaces','activities','notes','note_entries','attachments'] loop
 execute format('create policy own_insert on public.%I for insert to authenticated with check(owner_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['workspaces','activities','notes'] loop
 execute format('create policy own_update on public.%I for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['workspaces','attachments'] loop
 execute format('create policy own_delete on public.%I for delete to authenticated using(owner_id=(select auth.uid()))',t);
 end loop;
end $$;
alter table public.audit_logs enable row level security;
create policy own_read on public.audit_logs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.activity_events, public.audit_logs from anon, authenticated;
grant select on public.activity_events,public.audit_logs to authenticated;
revoke update on public.activities from authenticated;
grant update(title,description,archived) on public.activities to authenticated;
revoke update, delete on public.note_entries from authenticated;
-- Initial state is never client-controlled, even on INSERT.
create function public.initial_activity() returns trigger language plpgsql as $$ begin new.status='not_started'; return new; end $$;
create trigger initial_activity before insert on public.activities for each row execute function public.initial_activity();

create function public.add_event(p_activity uuid,p_type public.event_type,p_content text,p_request uuid) returns public.activity_events
language plpgsql security definer set search_path=public as $$
declare a activities; e activity_events; target activity_status;
begin
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
 when p_type='resume' and a.status='paused' then 'in_progress'::activity_status
 when p_type='check_out' and a.status in ('in_progress','paused') then 'completed'::activity_status
 when p_type='observation' then a.status else null end;
 if target is null then raise exception 'Invalid transition'; end if;
 if (select count(*) from activity_events where owner_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then raise exception 'Too many events'; end if;
 insert into activity_events(activity_id,owner_id,type,content,request_id,created_at) values(a.id,auth.uid(),p_type,trim(p_content),p_request,clock_timestamp()) returning * into e;
 update activities set status=target where id=a.id;
 return e;
end $$;
create function public.save_entry(p_id uuid,p_content text,p_revision integer) returns public.note_entries
language plpgsql security definer set search_path=public as $$
declare e note_entries; begin
 update note_entries set content=p_content,revision=revision+1 where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into e;
 if not found then raise exception 'Conflict: reload entry before saving'; end if;
 update notes set updated_at=now() where id=e.note_id;
 return e;
end $$;
revoke all on function public.add_event(uuid,public.event_type,text,uuid),public.save_entry(uuid,text,integer) from public;
grant execute on function public.add_event(uuid,public.event_type,text,uuid),public.save_entry(uuid,text,integer) to authenticated;

create index activities_workspace on public.activities(workspace_id,updated_at desc);
create index events_activity on public.activity_events(activity_id,created_at,id);
create index notes_workspace on public.notes(workspace_id,updated_at desc);
create index entries_note on public.note_entries(note_id,created_at,id);
create index attachments_activity on public.attachments(activity_id);
create index attachments_note on public.attachments(note_id);
create index audit_owner on public.audit_logs(owner_id,created_at);
create index workspaces_owner on public.workspaces(owner_id);
create index activity_search on public.activities using gin(to_tsvector('portuguese',title || ' ' || description));
create index event_search on public.activity_events using gin(to_tsvector('portuguese',content));
create index note_search on public.notes using gin(to_tsvector('portuguese',title));
create index entry_search on public.note_entries using gin(to_tsvector('portuguese',content));
create index workspace_search on public.workspaces using gin(to_tsvector('portuguese',name || ' ' || description));
create index attachment_search on public.attachments using gin(to_tsvector('portuguese',regexp_replace(name,'[^[:alnum:]]',' ','g')));

create function public.search_all(p_query text,p_workspace uuid default null,p_kind text default null,p_status text default null,p_from timestamptz default null,p_to timestamptz default null,p_mime text default null,p_offset integer default 0)
returns table(id uuid,workspace_id uuid,parent_id uuid,kind text,title text,excerpt text,created_at timestamptz,status text,mime text)
language sql stable security invoker set search_path=public as $$
 with results as (
 select w.id,w.id workspace_id,w.id parent_id,'workspace' kind,w.name title,w.description excerpt,w.created_at,null::text status,null::text mime from workspaces w where to_tsvector('portuguese',w.name || ' ' || w.description) @@ websearch_to_tsquery('portuguese',p_query)
 union all select a.id,a.workspace_id,a.id,'activity',a.title,a.description,a.created_at,a.status::text,null from activities a where to_tsvector('portuguese',a.title || ' ' || a.description) @@ websearch_to_tsquery('portuguese',p_query)
 union all select e.id,a.workspace_id,a.id,'event',a.title,e.content,e.created_at,a.status::text,null from activity_events e join activities a on a.id=e.activity_id where to_tsvector('portuguese',e.content) @@ websearch_to_tsquery('portuguese',p_query)
 union all select n.id,n.workspace_id,n.id,'note',n.title,'',n.created_at,null,null from notes n where to_tsvector('portuguese',n.title) @@ websearch_to_tsquery('portuguese',p_query)
 union all select e.id,n.workspace_id,n.id,'entry',n.title,e.content,e.created_at,null,null from note_entries e join notes n on n.id=e.note_id where to_tsvector('portuguese',e.content) @@ websearch_to_tsquery('portuguese',p_query)
 union all select f.id,coalesce(a.workspace_id,n.workspace_id),coalesce(a.id,n.id),'file',f.name,case when a.id is not null then 'activity' else 'note' end,f.created_at,a.status::text,f.mime from attachments f left join activities a on a.id=f.activity_id left join notes n on n.id=f.note_id where to_tsvector('portuguese',regexp_replace(f.name,'[^[:alnum:]]',' ','g')) @@ websearch_to_tsquery('portuguese',p_query)
 ) select r.id,r.workspace_id,r.parent_id,r.kind,r.title,left(r.excerpt,300),r.created_at,r.status,r.mime from results r
 where (p_workspace is null or r.workspace_id=p_workspace) and (p_kind is null or r.kind=p_kind) and (p_status is null or r.status=p_status) and (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<=p_to) and (p_mime is null or r.mime=p_mime)
 order by r.created_at desc,r.id limit 50 offset greatest(p_offset,0);
$$;
revoke all on function public.search_all(text,uuid,text,text,timestamptz,timestamptz,text,integer) from public;
grant execute on function public.search_all(text,uuid,text,text,timestamptz,timestamptz,text,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp','video/mp4','video/webm','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
create policy file_read on storage.objects for select to authenticated using(bucket_id='attachments' and exists(select 1 from public.attachments a where a.path=name and a.owner_id=auth.uid()));
create policy file_insert on storage.objects for insert to authenticated with check(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.attachments a where a.path=name and a.owner_id=auth.uid()));
create policy file_delete on storage.objects for delete to authenticated using(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text);

