-- Keep one active knowledge item for each canonical source URL and prevent races
-- from recreating duplicates. Archived records remain available for audit.

update public.knowledge_items
set source_url = regexp_replace(regexp_replace(trim(source_url), '#.*$', ''), '/+$', '')
where nullif(trim(source_url), '') is not null;

with ranked as (
  select id,
         row_number() over (
           partition by user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), source_url
           order by updated_at desc, created_at desc, id desc
         ) as duplicate_rank
  from public.knowledge_items
  where status <> 'archived' and nullif(source_url, '') is not null
)
update public.knowledge_items item
set status = 'archived'
from ranked
where item.id = ranked.id and ranked.duplicate_rank > 1;

create unique index if not exists knowledge_items_active_source_url_unique
  on public.knowledge_items (
    user_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_url
  )
  where status <> 'archived' and nullif(source_url, '') is not null;
