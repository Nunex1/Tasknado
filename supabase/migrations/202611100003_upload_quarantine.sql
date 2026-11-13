-- Same private bucket, but no object becomes readable until a trusted worker
-- approves the immutable bytes. Existing files deliberately start pending too.
alter table public.attachments add column scan_status text not null default 'pending'
 check(scan_status in ('pending','clean','rejected'));
alter table public.attachments add column scanned_at timestamptz;
alter table public.attachments add column content_sha256 text;
alter table public.attachments add column next_scan_at timestamptz not null default now();
revoke insert on public.attachments from authenticated;
grant insert(id,owner_id,activity_id,note_id,event_id,name,path,mime,size) on public.attachments to authenticated;

-- Permanent path reservations prevent delayed cleanup/scan from affecting a
-- replacement object after metadata deletion. They contain no file content.
create table public.attachment_paths(path text primary key,
 owner_id uuid not null,
 reserved_bytes bigint not null default 20971520 check(reserved_bytes between 0 and 20971520));
alter table public.attachment_paths enable row level security;
revoke all on public.attachment_paths from public,anon,authenticated;
insert into public.attachment_paths(path,owner_id)
 select path,owner_id from public.attachments
 union select path,split_part(path,'/',1)::uuid from public.storage_cleanup;
create function public.reserve_attachment_path() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 17894));
 if (select count(*) from public.attachments where owner_id=new.owner_id and scan_status='pending')>=10
 then raise exception 'Too many pending uploads'; end if;
 -- Reservations include rejected objects AND deleted metadata awaiting cleanup.
 -- Only the trusted worker can replace the worst-case reserve with actual size.
 if (select coalesce(sum(reserved_bytes),0)
     from public.attachment_paths where owner_id=new.owner_id) + 20971520 > 1073741824
 then raise exception 'Storage quota exceeded'; end if;
 insert into public.attachment_paths(path,owner_id) values(new.path,new.owner_id);
 return new;
end $$;
revoke all on function public.reserve_attachment_path() from public,anon,authenticated;
create trigger reserve_attachment_path before insert on public.attachments
 for each row execute function public.reserve_attachment_path();

drop policy file_read on storage.objects;
create policy file_read on storage.objects for select to authenticated using(
 bucket_id='attachments' and exists(select 1 from public.attachments a
 where a.path=storage.objects.name and a.owner_id=auth.uid() and a.scan_status='clean'));
drop policy file_insert on storage.objects;
create policy file_insert on storage.objects for insert to authenticated with check(
 bucket_id='attachments' and exists(select 1 from public.attachments a
 where a.path=storage.objects.name and a.owner_id=auth.uid() and a.scan_status='pending'));
-- No UPDATE policy: neither overwrites nor moves are permitted.
-- User deletion is metadata-first; the trusted cleanup worker deletes bytes.
drop policy file_delete on storage.objects;
grant select,update(scan_status,scanned_at,content_sha256,next_scan_at) on public.attachments to service_role;
grant select,update(reserved_bytes) on public.attachment_paths to service_role;
grant select,delete on public.storage_cleanup to service_role;
