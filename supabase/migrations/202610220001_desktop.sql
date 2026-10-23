-- Incremental desktop evolution. Existing records and migrations remain intact.
create table public.workspace_observations (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 workspace_id uuid not null,
 content text not null check(length(trim(content)) between 1 and 20000),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade
);
alter table public.workspace_observations enable row level security;
revoke all on public.workspace_observations from anon,authenticated;
grant select,delete on public.workspace_observations to authenticated;
grant insert(workspace_id,content),update(content) on public.workspace_observations to authenticated;
create policy own_read on public.workspace_observations for select to authenticated using(owner_id=(select auth.uid()));
create policy own_insert on public.workspace_observations for insert to authenticated with check(owner_id=(select auth.uid()));
create policy own_update on public.workspace_observations for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy own_delete on public.workspace_observations for delete to authenticated using(owner_id=(select auth.uid()));
create trigger stamp before insert or update on public.workspace_observations for each row execute function public.stamp();
create index workspace_observations_order on public.workspace_observations(workspace_id,created_at desc,id);
create index workspace_observations_search on public.workspace_observations using gin(to_tsvector('portuguese',content));

-- Append-only factual snapshots. Activity deletion does not rewrite history.
create table public.workspace_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 workspace_id uuid not null, activity_id uuid, source_id uuid not null,
 action text not null, title text not null default '', previous jsonb, current jsonb,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade
);
alter table public.workspace_events enable row level security;
revoke all on public.workspace_events from anon,authenticated;
grant select on public.workspace_events to authenticated;
create policy own_read on public.workspace_events for select to authenticated using(owner_id=(select auth.uid()));
create index workspace_events_order on public.workspace_events(workspace_id,created_at desc,id);
create index workspace_events_source on public.workspace_events(source_id,action);

create function public.record_workspace_event() returns trigger language plpgsql security definer set search_path=public as $$
declare r record; w uuid; a uuid; label text; prev jsonb; curr jsonb;
begin
 if TG_OP='DELETE' then r=old; else r=new; end if;
 if TG_TABLE_NAME='activities' then
  w=r.workspace_id; a=r.id; label=r.title;
  if TG_OP='INSERT' then
   insert into workspace_events(owner_id,workspace_id,activity_id,source_id,action,title,current)
    values(r.owner_id,w,a,r.id,'activity_created',label,jsonb_build_object('status',r.status));
  else
   if old.status is distinct from new.status then
    insert into workspace_events(owner_id,workspace_id,activity_id,source_id,action,title,previous,current)
     values(r.owner_id,w,a,r.id,'status_changed',label,to_jsonb(old.status),to_jsonb(new.status));
   end if;
   prev=old.category_attributes->'work'; curr=new.category_attributes->'work';
   if (prev - array['isUrgent','isImportant']) is distinct from (curr - array['isUrgent','isImportant']) then
    insert into workspace_events(owner_id,workspace_id,activity_id,source_id,action,title,previous,current)
     values(r.owner_id,w,a,r.id,'schedule_changed',label,prev - array['isUrgent','isImportant'],curr - array['isUrgent','isImportant']);
   end if;
  end if;
 elsif TG_TABLE_NAME='activity_events' then
  select workspace_id,title into w,label from activities where id=r.activity_id and owner_id=r.owner_id;
  a=r.activity_id;
  if r.type<>'observation' then return r; end if;
 elsif TG_TABLE_NAME='workspace_observations' then
  w=r.workspace_id; label='';
 end if;
 if TG_TABLE_NAME<>'activities' and exists(select 1 from workspaces where id=w and owner_id=r.owner_id) then
  insert into workspace_events(owner_id,workspace_id,activity_id,source_id,action,title,previous,current)
   values(r.owner_id,w,a,r.id,case TG_OP when 'INSERT' then 'observation_created' when 'UPDATE' then 'observation_edited' else 'observation_deleted' end,label,
    case when TG_OP<>'INSERT' then jsonb_build_object('content',old.content) end,
    case when TG_OP<>'DELETE' then jsonb_build_object('content',new.content) end);
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger workspace_event after insert or update on public.activities for each row execute function public.record_workspace_event();
create trigger workspace_event after insert or update or delete on public.activity_events for each row execute function public.record_workspace_event();
create trigger workspace_event after insert or update or delete on public.workspace_observations for each row execute function public.record_workspace_event();

-- Reuses historical persisted timestamps. Nothing is backfilled or inferred.
create function public.workspace_timeline(p_workspace uuid,p_offset integer default 0)
returns table(id uuid,activity_id uuid,action text,title text,previous jsonb,current jsonb,created_at timestamptz)
language sql stable security invoker set search_path=public as $$
 with history as (
  select e.id,e.activity_id,e.action,e.title,e.previous,e.current,e.created_at from workspace_events e where e.workspace_id=p_workspace
  union all select a.id,a.id,'activity_created',a.title,null,null,a.created_at from activities a where a.workspace_id=p_workspace and not exists(select 1 from workspace_events e where e.source_id=a.id and e.action='activity_created')
  union all select e.id,a.id,case when e.type='observation' then 'observation_created' else e.type::text end,a.title,null,jsonb_build_object('content',e.content),e.created_at from activity_events e join activities a on a.id=e.activity_id where a.workspace_id=p_workspace and not exists(select 1 from workspace_events h where h.source_id=e.id and h.action='observation_created')
  union all select h.id,a.id,'priority_changed',a.title,h.previous,h.current,h.created_at from priority_history h join activities a on a.id=h.activity_id where a.workspace_id=p_workspace
 ) select * from history order by created_at desc,id desc limit 50 offset greatest(0,p_offset);
$$;
revoke all on function public.workspace_timeline(uuid,integer) from public;
grant execute on function public.workspace_timeline(uuid,integer) to authenticated;

create function public.observation_counts(p_workspace uuid default null)
returns table(activity_id uuid,total bigint) language sql stable security invoker set search_path=public as $$
 select a.id,count(e.id) from activities a left join activity_events e on e.activity_id=a.id and e.type='observation'
 where p_workspace is null or a.workspace_id=p_workspace group by a.id;
$$;
revoke all on function public.observation_counts(uuid) from public;
grant execute on function public.observation_counts(uuid) to authenticated;

create or replace function public.search_all(p_query text,p_workspace uuid default null,p_kind text default null,p_status text default null,p_from timestamptz default null,p_to timestamptz default null,p_mime text default null,p_offset integer default 0)
returns table(id uuid,workspace_id uuid,parent_id uuid,kind text,title text,excerpt text,created_at timestamptz,status text,mime text)
language sql stable security invoker set search_path=public as $$
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
