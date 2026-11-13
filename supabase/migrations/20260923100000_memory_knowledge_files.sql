-- Private uploads attached to project memory and knowledge.
insert into storage.buckets (id, name, public, file_size_limit)
values ('memory-knowledge-files', 'memory-knowledge-files', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Users read own memory knowledge files" on storage.objects;
create policy "Users read own memory knowledge files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memory-knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload own memory knowledge files" on storage.objects;
create policy "Users upload own memory knowledge files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own memory knowledge files" on storage.objects;
create policy "Users update own memory knowledge files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'memory-knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'memory-knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own memory knowledge files" on storage.objects;
create policy "Users delete own memory knowledge files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'memory-knowledge-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
