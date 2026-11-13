-- Allow an explicit, recorded resumption after completion. Archived tasks must first be restored.
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

create index if not exists events_owner_created on public.activity_events(owner_id,created_at);
