-- Qualify the outer column: attachments also has a name column.
drop policy file_read on storage.objects;
drop policy file_insert on storage.objects;
create policy file_read on storage.objects for select to authenticated using(bucket_id='attachments' and exists(select 1 from public.attachments a where a.path=storage.objects.name and a.owner_id=auth.uid()));
create policy file_insert on storage.objects for insert to authenticated with check(bucket_id='attachments' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.attachments a where a.path=storage.objects.name and a.owner_id=auth.uid()));
