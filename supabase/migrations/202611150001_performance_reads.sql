-- Additive performance APIs. All reads remain SECURITY INVOKER under existing RLS.
create function public.literal_pattern(value text) returns text
language sql immutable parallel safe set search_path=pg_catalog as $$
 select '%' || replace(replace(replace(trim(value), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
$$;
revoke all on function public.literal_pattern(text) from public;
grant execute on function public.literal_pattern(text) to authenticated;

create index activities_owner_updated_page on public.activities(owner_id,updated_at desc,id desc);
create index activities_workspace_updated_page on public.activities(workspace_id,updated_at desc,id desc);
create index activities_owner_created_page on public.activities(owner_id,created_at desc,id desc);
create index activities_owner_title_page on public.activities(owner_id,lower(title),id);
create index activities_workspace_created_page on public.activities(workspace_id,created_at desc,id desc);
create index activities_workspace_title_page on public.activities(workspace_id,lower(title),id);
create index activities_workspace_scheduled_page on public.activities(workspace_id,(coalesce(category_attributes->'work'->>'scheduledDate','9999') || coalesce(category_attributes->'work'->>'scheduledTime','23:59')),id);
create index observations_activity_count on public.activity_events(activity_id) where type='observation';


create function public.activity_page(p_workspace uuid default null,p_filters jsonb default '{}',p_sort text default 'updated_at',p_after jsonb default null,p_size integer default 50)
returns table(id uuid,workspace_id uuid,title text,description text,status public.activity_status,archived boolean,category_attributes jsonb,created_at timestamptz,updated_at timestamptz,cursor_value text)
language plpgsql stable security invoker set search_path=pg_catalog,public as $fn$
declare expr text; direction text; comparison text; value_type text;
begin
 case p_sort
 when 'title' then expr='lower(a.title)'; direction='asc'; comparison='>'; value_type='text';
 when 'scheduled' then expr=$expr$coalesce(a.category_attributes->'work'->>'scheduledDate','9999') || coalesce(a.category_attributes->'work'->>'scheduledTime','23:59')$expr$; direction='asc'; comparison='>'; value_type='text';
 when 'created_at' then expr='a.created_at'; direction='desc'; comparison='<'; value_type='timestamptz';
 else expr='a.updated_at'; direction='desc'; comparison='<'; value_type='timestamptz';
 end case;
 -- Only the four constant expressions above enter the SQL; all caller input is bound.
 return query execute format($query$
 select a.id,a.workspace_id,a.title,left(a.description,300),a.status,a.archived,a.category_attributes,a.created_at,a.updated_at,(%1$s)::text
 from public.activities a where a.owner_id=(select auth.uid())
 and ($1 is null or a.workspace_id=$1)
 and (case when coalesce($2->>'status','')='completed' and not coalesce(($2->>'archived')::boolean,false) then true else a.archived=coalesce(($2->>'archived')::boolean,false) end)
 and (coalesce($2->>'status','')='' or case $2->>'status' when 'started' then a.status in ('in_progress','paused') when 'open' then a.status<>'completed' else a.status::text=$2->>'status' end)
 and (coalesce($2->>'query','')='' or (a.title || ' ' || a.description) ilike public.literal_pattern($2->>'query'))
 and (coalesce($2->>'canvas','')='' or a.category_attributes->'university'->>'openedInCanvas'=$2->>'canvas')
 and (coalesce($2->>'schedule','')='' or case $2->>'schedule'
   when 'overdue' then a.status<>'completed' and a.category_attributes->'work'->>'hasScheduledDate'='true'
     and (a.category_attributes->'work'->>'scheduledDate' || 'T' || coalesce(a.category_attributes->'work'->>'scheduledTime','23:59:59')) < $2->>'localNow'
   when 'yes' then a.category_attributes->'work'->>'hasScheduledDate'='true'
   else coalesce(a.category_attributes->'work'->>'hasScheduledDate','false')='false' end)
 and (coalesce($2->>'from','')='' or a.category_attributes->'work'->>'scheduledDate'>=$2->>'from')
 and (coalesce($2->>'to','')='' or a.category_attributes->'work'->>'scheduledDate'<=$2->>'to')
 and (coalesce($2->>'quadrant','')='' or
   case when a.category_attributes->'work'->>'isUrgent' is null or a.category_attributes->'work'->>'isImportant' is null then 'unclassified'
    when a.category_attributes->'work'->>'isImportant'='true' then case when a.category_attributes->'work'->>'isUrgent'='true' then 'q1' else 'q2' end
    else case when a.category_attributes->'work'->>'isUrgent'='true' then 'q3' else 'q4' end end=$2->>'quadrant')
 and (coalesce($2->>'focus','')<>'priority' or (a.status<>'completed'
   and exists(select 1 from public.workspaces w where w.id=a.workspace_id and w.category='work')
   and ((a.category_attributes->'work'->>'isUrgent'='true' and a.category_attributes->'work'->>'isImportant'='true')
    or (a.category_attributes->'work'->>'hasScheduledDate'='true' and
     (a.category_attributes->'work'->>'scheduledDate' || 'T' || coalesce(a.category_attributes->'work'->>'scheduledTime','23:59:59')) < $2->>'localNow'))))
 and ($3 is null or ((%1$s),a.id) %2$s (($3->>'value')::%3$s,($3->>'id')::uuid))
 order by (%1$s) %4$s,a.id %4$s limit $4
 $query$,expr,comparison,value_type,direction)
 using p_workspace,p_filters,p_after,least(50,greatest(1,p_size))+1;
end $fn$;
create function public.activity_total(p_workspace uuid default null,p_filters jsonb default '{}')
returns bigint language sql stable security invoker set search_path=pg_catalog,public as $$
 select count(*) from public.activities a where a.owner_id=(select auth.uid())
 and ($1 is null or a.workspace_id=$1)
 and (case when coalesce($2->>'status','')='completed' and not coalesce(($2->>'archived')::boolean,false) then true else a.archived=coalesce(($2->>'archived')::boolean,false) end)
 and (coalesce($2->>'status','')='' or case $2->>'status' when 'started' then a.status in ('in_progress','paused') when 'open' then a.status<>'completed' else a.status::text=$2->>'status' end)
 and (coalesce($2->>'query','')='' or (a.title || ' ' || a.description) ilike public.literal_pattern($2->>'query'))
 and (coalesce($2->>'canvas','')='' or a.category_attributes->'university'->>'openedInCanvas'=$2->>'canvas')
 and (coalesce($2->>'schedule','')='' or case $2->>'schedule'
   when 'overdue' then a.status<>'completed' and a.category_attributes->'work'->>'hasScheduledDate'='true'
     and (a.category_attributes->'work'->>'scheduledDate' || 'T' || coalesce(a.category_attributes->'work'->>'scheduledTime','23:59:59')) < $2->>'localNow'
   when 'yes' then a.category_attributes->'work'->>'hasScheduledDate'='true'
   else coalesce(a.category_attributes->'work'->>'hasScheduledDate','false')='false' end)
 and (coalesce($2->>'from','')='' or a.category_attributes->'work'->>'scheduledDate'>=$2->>'from')
 and (coalesce($2->>'to','')='' or a.category_attributes->'work'->>'scheduledDate'<=$2->>'to')
 and (coalesce($2->>'quadrant','')='' or
   case when a.category_attributes->'work'->>'isUrgent' is null or a.category_attributes->'work'->>'isImportant' is null then 'unclassified'
    when a.category_attributes->'work'->>'isImportant'='true' then case when a.category_attributes->'work'->>'isUrgent'='true' then 'q1' else 'q2' end
    else case when a.category_attributes->'work'->>'isUrgent'='true' then 'q3' else 'q4' end end=$2->>'quadrant')
 and (coalesce($2->>'focus','')<>'priority' or (a.status<>'completed'
   and exists(select 1 from public.workspaces w where w.id=a.workspace_id and w.category='work')
   and ((a.category_attributes->'work'->>'isUrgent'='true' and a.category_attributes->'work'->>'isImportant'='true')
    or (a.category_attributes->'work'->>'hasScheduledDate'='true' and
     (a.category_attributes->'work'->>'scheduledDate' || 'T' || coalesce(a.category_attributes->'work'->>'scheduledTime','23:59:59')) < $2->>'localNow'))))
$$;
create function public.activity_summary(p_workspace uuid default null)
returns table(not_started bigint,started bigint,completed bigint)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select count(*) filter(where not archived and status='not_started'),
 count(*) filter(where not archived and status in ('in_progress','paused')),
 count(*) filter(where status='completed')
 from public.activities where owner_id=(select auth.uid()) and (p_workspace is null or workspace_id=p_workspace)
$$;
create function public.observation_counts_for(p_activities uuid[])
returns table(activity_id uuid,total bigint) language sql stable security invoker set search_path=pg_catalog,public as $$
 select a.id,count(e.id) from public.activities a
 left join public.activity_events e on e.activity_id=a.id and e.type='observation'
 where a.owner_id=(select auth.uid()) and a.id=any(p_activities[1:200]) group by a.id
$$;
revoke all on function public.activity_page(uuid,jsonb,text,jsonb,integer),public.activity_total(uuid,jsonb),public.activity_summary(uuid),public.observation_counts_for(uuid[]) from public;
grant execute on function public.activity_page(uuid,jsonb,text,jsonb,integer),public.activity_total(uuid,jsonb),public.activity_summary(uuid),public.observation_counts_for(uuid[]) to authenticated;


-- Preserve the legacy timeline API; new readers use a stable timestamp/id cursor.
create function public.workspace_timeline_page(p_workspace uuid,p_after timestamptz default null,p_id uuid default null)
returns table(id uuid,activity_id uuid,action text,title text,previous jsonb,current jsonb,created_at timestamptz)
language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 with history as (
  select e.id,e.activity_id,e.action,e.title,e.previous,e.current,e.created_at from workspace_events e where e.workspace_id=p_workspace
  union all select a.id,a.id,'activity_created',a.title,null,null,a.created_at from activities a where a.workspace_id=p_workspace and not exists(select 1 from workspace_events e where e.source_id=a.id and e.action='activity_created')
  union all select e.id,a.id,case when e.type='observation' then 'observation_created' else e.type::text end,a.title,null,jsonb_build_object('content',e.content),e.created_at from activity_events e join activities a on a.id=e.activity_id where a.workspace_id=p_workspace and not exists(select 1 from workspace_events h where h.source_id=e.id and h.action='observation_created')
  union all select h.id,a.id,'priority_changed',a.title,h.previous,h.current,h.created_at from priority_history h join activities a on a.id=h.activity_id where a.workspace_id=p_workspace
 ) select * from history where p_after is null or (created_at,id)<(p_after,p_id) order by created_at desc,id desc limit 51;
$$;
revoke all on function public.workspace_timeline_page(uuid,timestamptz,uuid) from public;
grant execute on function public.workspace_timeline_page(uuid,timestamptz,uuid) to authenticated;
