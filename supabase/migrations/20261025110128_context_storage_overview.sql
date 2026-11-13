-- Private account storage overview; RLS and explicit owner filters both apply.
create function public.context_storage_overview(p_after text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=(select auth.uid()); result jsonb;
begin
 if uid is null then raise exception 'Sign in to view storage'; end if;
 select jsonb_build_object(
 'memory',(select jsonb_build_object('count',count(*),'bytes',coalesce(sum(octet_length(content)),0)) from public.memory_records where user_id=uid),
 'knowledge',(select jsonb_build_object('count',count(*),'bytes',coalesce(sum(octet_length(content)),0)) from public.knowledge_items where user_id=uid and status<>'archived'),
 'storage',(select jsonb_build_object('count',count(*),'bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0)) from storage.objects where bucket_id='memory-knowledge-files' and starts_with(name,uid::text||'/')),
 'memories',(select coalesce(jsonb_agg(x),'[]') from (select id,title,left(content,240) as preview,octet_length(content) as bytes,memory_type as kind,updated_at from public.memory_records where user_id=uid order by updated_at desc,id desc limit 5) x),
 'knowledge_items',(select coalesce(jsonb_agg(x),'[]') from (select id,title,left(content,240) as preview,octet_length(content) as bytes,source_type as kind,updated_at from public.knowledge_items where user_id=uid and status<>'archived' order by updated_at desc,id desc limit 5) x),
 'files',(select coalesce(jsonb_agg(x),'[]') from (select id,name,created_at,metadata->>'mimetype' as mime_type,case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end as bytes from storage.objects where bucket_id='memory-knowledge-files' and starts_with(name,uid::text||'/') and (p_after is null or name>p_after) order by name limit 50) x)
 ) into result;
 return result;
end $$;
revoke all on function public.context_storage_overview(text) from public,anon;
grant execute on function public.context_storage_overview(text) to authenticated;
