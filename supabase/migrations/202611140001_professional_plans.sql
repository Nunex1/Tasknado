-- Professional plans are private to an owner and available only in Work.
-- Inactive-category rows survive, including in the account export.
create table public.career_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  company text not null check (length(trim(company)) between 1 and 200),
  region text not null check (region in ('brazil','abroad')),
  country text not null check (length(trim(country)) between 1 and 120),
  position text not null check (length(trim(position)) between 1 and 200),
  location text not null default '' check (length(location)<=300),
  work_mode text not null default '' check (work_mode in ('','onsite','hybrid','remote')),
  priority smallint not null default 2 check (priority between 1 and 3),
  opportunity_url text not null default '' check (length(opportunity_url)<=2000 and (opportunity_url='' or opportunity_url ~* '^https?://[^[:space:]]+$')),
  market_requirements text not null default '' check (length(market_requirements)<=50000),
  notes text not null default '' check (length(notes)<=20000),
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,workspace_id,owner_id),
  foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade
);

create table public.professional_development_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_id uuid not null,
  development_area text not null check (length(trim(development_area)) between 1 and 20000),
  action_plan text not null check (length(trim(action_plan)) between 1 and 20000),
  start_date date,
  due_date date,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  success_criteria text not null default '' check (length(success_criteria)<=20000),
  evidence text not null default '' check (length(evidence)<=20000),
  notes text not null default '' check (length(notes)<=20000),
  career_target_id uuid,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date>=start_date),
  foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(career_target_id,workspace_id,owner_id) references public.career_targets(id,workspace_id,owner_id) on delete set null (career_target_id)
);

-- Metadata cannot be forged, including by an insert that supplies defaults.
create function public.stamp_professional_plan() returns trigger
language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
  if TG_OP='INSERT' then
    new.created_at=clock_timestamp(); new.revision=1;
  else
    if new.id<>old.id or new.owner_id<>old.owner_id or new.workspace_id<>old.workspace_id then
      raise exception 'Plan identity cannot change';
    end if;
    new.created_at=old.created_at; new.revision=old.revision+1;
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function public.stamp_professional_plan() from public,anon,authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array['career_targets','professional_development_items'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select,delete on public.%I to authenticated',table_name);
    execute format('create policy work_owner on public.%I for all to authenticated
      using (owner_id=(select auth.uid()) and exists (
        select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.category=''work''))
      with check (owner_id=(select auth.uid()) and exists (
        select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.category=''work''))',table_name);
    execute format('create trigger stamp_professional_plan before insert or update on public.%I for each row execute function public.stamp_professional_plan()',table_name);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit()',table_name);
  end loop;
end $$;

grant insert(workspace_id,company,region,country,position,location,work_mode,priority,opportunity_url,market_requirements,notes,sort_order),
      update(company,region,country,position,location,work_mode,priority,opportunity_url,market_requirements,notes,sort_order)
  on public.career_targets to authenticated;
grant insert(workspace_id,development_area,action_plan,start_date,due_date,priority,status,success_criteria,evidence,notes,career_target_id),
      update(development_area,action_plan,start_date,due_date,priority,status,success_criteria,evidence,notes,career_target_id)
  on public.professional_development_items to authenticated;

create index career_targets_workspace_order on public.career_targets(workspace_id,sort_order,id);
create index career_targets_workspace_region on public.career_targets(workspace_id,region,priority,id);
create index career_targets_owner on public.career_targets(owner_id,id);
create index development_workspace_date on public.professional_development_items(workspace_id,created_at desc,id);
create index development_workspace_status on public.professional_development_items(workspace_id,status,priority,id);
create index development_owner on public.professional_development_items(owner_id,id);
create index development_target on public.professional_development_items(career_target_id,workspace_id,owner_id);

-- Explicit export is the sole category-independent read path. No caller-chosen
-- owner, dynamic SQL or arbitrary table name. Bounded pages like existing export.
create function public.export_professional_plans(p_table text,p_offset integer default 0)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_offset is null or p_offset<0 then raise exception 'Invalid offset'; end if;
  if p_table='career_targets' then
    select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
      select * from public.career_targets where owner_id=auth.uid() order by id limit 500 offset p_offset
    ) r;
  elsif p_table='professional_development_items' then
    select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
      select * from public.professional_development_items where owner_id=auth.uid() order by id limit 500 offset p_offset
    ) r;
  else raise exception 'Invalid export table'; end if;
  return result;
end $$;
revoke all on function public.export_professional_plans(text,integer) from public,anon,authenticated;
grant execute on function public.export_professional_plans(text,integer) to authenticated;
