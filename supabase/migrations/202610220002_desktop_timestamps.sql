-- Server-controlled creation/update timestamps, equal until the first edit.
create or replace function public.stamp() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then new.created_at=clock_timestamp(); new.updated_at=new.created_at;
 else
  new.created_at=old.created_at;
  if new.owner_id<>old.owner_id then raise exception 'Owner cannot change'; end if;
  new.updated_at=clock_timestamp();
 end if;
 return new;
end $$;
create function public.touch_parent_workspace() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;
begin
 if TG_OP='DELETE' then r=old; else r=new; end if;
 update workspaces set updated_at=clock_timestamp() where id=r.workspace_id and owner_id=r.owner_id;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger touch_parent after insert or update or delete on public.activities for each row execute function public.touch_parent_workspace();
create trigger touch_parent after insert or update or delete on public.workspace_observations for each row execute function public.touch_parent_workspace();
create trigger touch_parent after insert or update or delete on public.notes for each row execute function public.touch_parent_workspace();
