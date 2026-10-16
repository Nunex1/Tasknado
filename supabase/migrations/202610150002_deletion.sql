-- Soft queue for private storage cleanup. Rows become inaccessible immediately.
create table public.storage_cleanup (path text primary key, created_at timestamptz not null default now());
alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from anon,authenticated;
create function public.queue_file_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into storage_cleanup(path) values(old.path) on conflict do nothing; return old; end $$;
create trigger queue_file_cleanup before delete on public.attachments for each row execute function public.queue_file_cleanup();
revoke delete on public.workspaces from authenticated;
create function public.delete_workspace(p_workspace uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 delete from workspaces where id=p_workspace and owner_id=auth.uid();
 if not found then raise exception 'Workspace unavailable'; end if;
end $$;
revoke all on function public.delete_workspace(uuid) from public;
grant execute on function public.delete_workspace(uuid) to authenticated;
