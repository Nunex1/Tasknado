create index activities_owner on public.activities(owner_id,updated_at desc);
create index events_owner on public.activity_events(owner_id,created_at desc);
create index notes_owner on public.notes(owner_id,updated_at desc);
create index entries_owner on public.note_entries(owner_id);
create index attachments_owner on public.attachments(owner_id);
create index attachments_event on public.attachments(event_id);
-- Prevent manually forged initial revisions; only the save RPC increments them.
create function public.initial_entry() returns trigger language plpgsql as $$ begin new.revision=1; return new; end $$;
create trigger initial_entry before insert on public.note_entries for each row execute function public.initial_entry();
