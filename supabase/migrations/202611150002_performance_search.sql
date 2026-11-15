-- RLS blocks non-leakproof trigram/FTS operators from becoming index quals in the measured plans.
-- Keep invoker/RLS semantics; compute tokenization once when content changes, not once per scanned row.
-- Existing expression GIN indexes remain for compatibility with old clients. No unproven new GIN index.
alter table public.workspaces add column search_document tsvector generated always as (to_tsvector('portuguese',name || ' ' || description)) stored;
alter table public.activities add column search_document tsvector generated always as (to_tsvector('portuguese',title || ' ' || description)) stored;
alter table public.activity_events add column search_document tsvector generated always as (to_tsvector('portuguese',content)) stored;
alter table public.workspace_observations add column search_document tsvector generated always as (to_tsvector('portuguese',content)) stored;
alter table public.notes add column search_document tsvector generated always as (to_tsvector('portuguese',title)) stored;
alter table public.note_entries add column search_document tsvector generated always as (to_tsvector('portuguese',content)) stored;
alter table public.attachments add column search_document tsvector generated always as (to_tsvector('portuguese',regexp_replace(name,'[^[:alnum:]]',' ','g'))) stored;
create index workspace_observations_owner_page on public.workspace_observations(owner_id,created_at desc,id);
create or replace function public.search_all(p_query text,p_workspace uuid default null,p_kind text default null,p_status text default null,p_from timestamptz default null,p_to timestamptz default null,p_mime text default null,p_offset integer default 0)
returns table(id uuid,workspace_id uuid,parent_id uuid,kind text,title text,excerpt text,created_at timestamptz,status text,mime text)
language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 with results as (
 select w.id,w.id workspace_id,w.id parent_id,'workspace' kind,w.name title,w.description excerpt,w.created_at,null::text status,null::text mime from workspaces w where w.search_document @@ websearch_to_tsquery('portuguese',p_query) or (w.name || ' ' || w.description) ilike public.literal_pattern(p_query)
 union all select a.id,a.workspace_id,a.id,'activity',a.title,a.description,a.created_at,a.status::text,null from activities a where a.search_document @@ websearch_to_tsquery('portuguese',p_query) or (a.title || ' ' || a.description) ilike public.literal_pattern(p_query)
 union all select e.id,a.workspace_id,a.id,'event',a.title,e.content,e.created_at,a.status::text,null from activity_events e join activities a on a.id=e.activity_id where e.search_document @@ websearch_to_tsquery('portuguese',p_query) or (e.content) ilike public.literal_pattern(p_query)
 union all select o.id,o.workspace_id,o.workspace_id,'workspace_observation',w.name,o.content,o.created_at,null,null from workspace_observations o join workspaces w on w.id=o.workspace_id where o.search_document @@ websearch_to_tsquery('portuguese',p_query) or (o.content) ilike public.literal_pattern(p_query)
 union all select n.id,n.workspace_id,n.id,'note',n.title,'',n.created_at,null,null from notes n where n.search_document @@ websearch_to_tsquery('portuguese',p_query) or (n.title) ilike public.literal_pattern(p_query)
 union all select e.id,n.workspace_id,n.id,'entry',n.title,e.content,e.created_at,null,null from note_entries e join notes n on n.id=e.note_id where e.search_document @@ websearch_to_tsquery('portuguese',p_query) or (e.content) ilike public.literal_pattern(p_query)
 union all select f.id,coalesce(a.workspace_id,n.workspace_id),coalesce(a.id,n.id),'file',f.name,case when a.id is not null then 'activity' else 'note' end,f.created_at,a.status::text,f.mime from attachments f left join activities a on a.id=f.activity_id left join notes n on n.id=f.note_id where f.search_document @@ websearch_to_tsquery('portuguese',p_query) or (f.name) ilike public.literal_pattern(p_query)
 ) select r.id,r.workspace_id,r.parent_id,r.kind,r.title,left(r.excerpt,300),r.created_at,r.status,r.mime from results r
 where length(trim(p_query))>0 and (p_workspace is null or r.workspace_id=p_workspace) and (p_kind is null or r.kind=p_kind) and (p_status is null or r.status=p_status) and (p_from is null or r.created_at>=p_from) and (p_to is null or r.created_at<=p_to) and (p_mime is null or r.mime=p_mime)
 order by r.created_at desc,r.id,r.kind limit 50 offset greatest(p_offset,0);
$$;
