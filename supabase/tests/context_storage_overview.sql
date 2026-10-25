begin;
-- Supply an existing test-account UUID through open_connect.test_user_id.
select set_config('request.jwt.claim.sub',current_setting('open_connect.test_user_id'),true);
set local role authenticated;
do $$
declare baseline jsonb; result jsonb; u uuid:=auth.uid(); i integer;
begin
 baseline:=public.context_storage_overview();
 insert into public.memory_records(user_id,title,content) values(u,'Storage byte regression','A🙂');
 for i in 1..51 loop
  insert into storage.objects(bucket_id,name,metadata) values('memory-knowledge-files',u::text||'/000-storage-test/'||lpad(i::text,3,'0')||'.png','{"size":123,"mimetype":"image/png"}');
 end loop;
 result:=public.context_storage_overview();
 if (result->'memory'->>'count')::bigint<>(baseline->'memory'->>'count')::bigint+1 then raise exception 'Memory count failed'; end if;
 if (result->'memory'->>'bytes')::bigint<>(baseline->'memory'->>'bytes')::bigint+5 then raise exception 'UTF8 byte count failed'; end if;
 if (result->'storage'->>'count')::bigint<>(baseline->'storage'->>'count')::bigint+51 then raise exception 'File count failed'; end if;
 if (result->'storage'->>'bytes')::bigint<>(baseline->'storage'->>'bytes')::bigint+51*123 then raise exception 'File size failed'; end if;
 if jsonb_array_length(result->'files')<>50 then raise exception 'File page limit failed'; end if;
 if exists(select 1 from jsonb_array_elements(result->'files') f where not starts_with(f->>'name',u::text||'/')) then raise exception 'Foreign file leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.context_storage_overview();
 if (result->'memory'->>'count')::int<>0 or (result->'knowledge'->>'count')::int<>0 or (result->'storage'->>'count')::int<>0 then raise exception 'Cross-account overview leaked'; end if;
end $$;
reset role;
rollback;
select 'Context counts, UTF8 bytes, file sizes, pagination and account isolation passed; fixtures rolled back' as result;
