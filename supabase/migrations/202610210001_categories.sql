-- Category extensions are namespaced; inactive namespaces are retained, read-only.
alter table public.workspaces add column category text not null default 'personal_life'
 check(category in ('personal_life','university','work','self_study','sports'));
alter table public.activities add column category_attributes jsonb not null default '{}';
grant update(category_attributes) on public.activities to authenticated;
alter table public.activity_events add column edited_at timestamptz;
create table public.priority_history (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 activity_id uuid not null, previous jsonb not null, current jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(activity_id,owner_id) references public.activities(id,owner_id) on delete cascade
);
alter table public.priority_history enable row level security;
revoke all on public.priority_history from anon,authenticated;
grant select on public.priority_history to authenticated;
create policy own_read on public.priority_history for select to authenticated using(owner_id=auth.uid());
create index priority_activity on public.priority_history(activity_id,created_at desc,id);
create function public.category_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare cat text; attrs jsonb; prior jsonb; before_priority jsonb; after_priority jsonb; d date; tm time;
begin
 select category into cat from workspaces where id=new.workspace_id and owner_id=new.owner_id for share;
 if not found then raise exception 'Workspace unavailable'; end if;
 prior=case when TG_OP='INSERT' then '{}'::jsonb else old.category_attributes end;
 attrs=new.category_attributes;
 if jsonb_typeof(attrs)<>'object' or (attrs - 'work' - 'university') <> '{}'::jsonb then raise exception 'Invalid category attributes'; end if;
 if (attrs - cat) is distinct from (prior - cat) then raise exception 'Inactive category attributes cannot change'; end if;
 if attrs ? 'university' then
 if jsonb_typeof(attrs->'university')<>'object' or ((attrs->'university') - 'openedInCanvas')<>'{}'::jsonb or jsonb_typeof(attrs#>'{university,openedInCanvas}') is distinct from 'boolean' then raise exception 'Canvas choice required'; end if;
 end if;
 if cat='university' and (TG_OP='INSERT' or new.title is distinct from old.title or new.description is distinct from old.description or attrs is distinct from prior) and not attrs ? 'university' then raise exception 'Canvas choice required'; end if;
 if attrs ? 'work' then
 if jsonb_typeof(attrs->'work')<>'object' or ((attrs->'work') - array['hasScheduledDate','scheduledDate','scheduledTime','isUrgent','isImportant'])<>'{}'::jsonb or jsonb_typeof(attrs#>'{work,hasScheduledDate}') is distinct from 'boolean' then raise exception 'Invalid schedule'; end if;
 if coalesce(jsonb_typeof(attrs#>'{work,isUrgent}'),'null') not in ('boolean','null') or coalesce(jsonb_typeof(attrs#>'{work,isImportant}'),'null') not in ('boolean','null') then raise exception 'Invalid priority'; end if;
 if (attrs#>>'{work,hasScheduledDate}')::boolean then
 if coalesce(attrs#>>'{work,scheduledDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Scheduled date required'; end if;
 d=(attrs#>>'{work,scheduledDate}')::date;
 if attrs#>>'{work,scheduledTime}' is not null then
 if (attrs#>>'{work,scheduledTime}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid scheduled time'; end if;
 tm=(attrs#>>'{work,scheduledTime}')::time;
 end if;
 elsif attrs#>>'{work,scheduledDate}' is not null or attrs#>>'{work,scheduledTime}' is not null then raise exception 'Unscheduled activity cannot have date or time';
 end if;
 end if;
 return new;
end $$;
create trigger category_guard before insert or update on public.activities for each row execute function public.category_guard();
create function public.record_priority() returns trigger language plpgsql security definer set search_path=public as $$
declare prev jsonb; curr jsonb;
begin
 prev=case when TG_OP='INSERT' then jsonb_build_object('isUrgent',null,'isImportant',null) else jsonb_build_object('isUrgent',old.category_attributes#>'{work,isUrgent}','isImportant',old.category_attributes#>'{work,isImportant}') end;
 curr=jsonb_build_object('isUrgent',new.category_attributes#>'{work,isUrgent}','isImportant',new.category_attributes#>'{work,isImportant}');
 if prev is distinct from curr then insert into priority_history(owner_id,activity_id,previous,current) values(new.owner_id,new.id,prev,curr); end if;
 return new;
end $$;
create trigger record_priority after insert or update on public.activities for each row execute function public.record_priority();
create function public.set_priority(p_activity uuid,p_urgent boolean,p_important boolean) returns void language plpgsql security definer set search_path=public as $$
declare a activities;
begin
 select * into a from activities where id=p_activity and owner_id=auth.uid() for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if a.archived then raise exception 'Archived activity'; end if;
 if not exists(select 1 from workspaces where id=a.workspace_id and category='work') then raise exception 'Workspace unavailable'; end if;
 update activities set category_attributes=jsonb_set(category_attributes,'{work}',coalesce(category_attributes->'work','{"hasScheduledDate":false,"scheduledDate":null,"scheduledTime":null}'::jsonb)||jsonb_build_object('isUrgent',p_urgent,'isImportant',p_important)) where id=a.id;
end $$;
-- Observations remain searchable in the existing event timeline. Execution events stay immutable.
create function public.edit_observation(p_id uuid,p_content text,p_expected text) returns void language plpgsql security definer set search_path=public as $$
declare e activity_events;
begin
 select * into e from activity_events where id=p_id and owner_id=auth.uid() and type='observation' for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if e.content is distinct from p_expected then raise exception 'Conflict'; end if;
 update activity_events set content=trim(p_content),edited_at=clock_timestamp() where id=e.id;
 update activities set updated_at=clock_timestamp() where id=e.activity_id;
end $$;
create function public.delete_observation(p_id uuid,p_expected text) returns void language plpgsql security definer set search_path=public as $$
declare e activity_events;
begin
 select * into e from activity_events where id=p_id and owner_id=auth.uid() and type='observation' for update;
 if not found then raise exception 'Activity unavailable'; end if;
 if e.content is distinct from p_expected then raise exception 'Conflict'; end if;
 -- Keep attachments even when the associated observation is explicitly deleted.
 update attachments set event_id=null where event_id=e.id;
 delete from activity_events where id=e.id;
 update activities set updated_at=clock_timestamp() where id=e.activity_id;
end $$;
revoke all on function public.set_priority(uuid,boolean,boolean),public.edit_observation(uuid,text,text),public.delete_observation(uuid,text) from public;
grant execute on function public.set_priority(uuid,boolean,boolean),public.edit_observation(uuid,text,text),public.delete_observation(uuid,text) to authenticated;
