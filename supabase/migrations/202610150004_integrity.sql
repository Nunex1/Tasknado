-- Account deletion must not recreate audit rows referencing a deleted auth user.
create or replace function public.audit() returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; entity_uuid uuid;
begin
 if TG_OP='DELETE' then owner=old.owner_id; entity_uuid=old.id; else owner=new.owner_id; entity_uuid=new.id; end if;
 if exists(select 1 from auth.users where id=owner) then
 insert into audit_logs(owner_id,entity,entity_id,action) values(owner,TG_TABLE_NAME,entity_uuid,TG_OP);
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
-- Event links are optional; ownership and the activity relationship are checked.
alter table public.activity_events add constraint event_owner_unique unique(id,owner_id);
alter table public.attachments add column event_id uuid;
alter table public.attachments add constraint attachment_event_owner foreign key(event_id,owner_id) references public.activity_events(id,owner_id) on delete cascade;
create function public.attachment_guard() returns trigger language plpgsql set search_path=public as $$
begin
 new.created_at=clock_timestamp();
 if new.event_id is not null and not exists(select 1 from activity_events where id=new.event_id and activity_id=new.activity_id and owner_id=new.owner_id) then raise exception 'Event does not belong to activity'; end if;
 return new;
end $$;
create trigger attachment_guard before insert on public.attachments for each row execute function public.attachment_guard();
create function public.delete_my_account() returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from auth.users where id=auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
