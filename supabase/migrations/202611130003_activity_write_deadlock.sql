-- Two concurrent writes to activities of the same workspace deadlocked: both
-- took a SHARE lock on the workspace row here, and both then needed the
-- exclusive row lock in touch_parent_workspace. PostgreSQL aborted one of them
-- after deadlock_timeout and the user saw a failed action.
--
-- Every activity write updates its workspace afterwards anyway, so the guard now
-- takes that stronger lock from the start: writers queue instead of colliding.
-- The validation rules are unchanged. Safe to run more than once.
create or replace function public.category_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare cat text; attrs jsonb; prior jsonb; before_priority jsonb; after_priority jsonb; d date; tm time;
begin
 -- Same lock mode touch_parent_workspace needs later in this transaction.
 select category into cat from workspaces where id=new.workspace_id and owner_id=new.owner_id for no key update;
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
