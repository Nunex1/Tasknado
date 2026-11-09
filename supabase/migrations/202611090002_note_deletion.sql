-- Granular notebook deletion. Direct DELETE stays unavailable to clients: both
-- operations run through owner-scoped functions, following delete_workspace.
-- A missing record and another account's record produce the same answer.
create function public.delete_entry(p_id uuid,p_note uuid) returns void
language plpgsql security definer set search_path=public as $$
declare parent uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Entry first, then note: the same lock order as save_entry.
 delete from note_entries where id=p_id and note_id=p_note and owner_id=auth.uid() returning note_id into parent;
 if not found then raise exception 'Entry unavailable'; end if;
 update notes set updated_at=clock_timestamp() where id=parent and owner_id=auth.uid();
end $$;
create function public.delete_note(p_note uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Lock the entries before the note so a concurrent save_entry cannot deadlock with the cascade.
 perform 1 from note_entries where note_id=p_note and owner_id=auth.uid() order by id for update;
 -- Entries and attachments follow through their composite (note_id, owner_id) foreign keys;
 -- attachment paths are queued for storage cleanup by the existing trigger.
 delete from notes where id=p_note and owner_id=auth.uid();
 if not found then raise exception 'Note unavailable'; end if;
end $$;
revoke all on function public.delete_entry(uuid,uuid),public.delete_note(uuid) from public,anon;
grant execute on function public.delete_entry(uuid,uuid),public.delete_note(uuid) to authenticated;
