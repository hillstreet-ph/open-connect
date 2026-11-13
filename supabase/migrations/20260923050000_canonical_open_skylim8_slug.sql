-- Restore the canonical public slug expected by ChatGPT and Open-Connect fetch.
-- The project_resources relationship uses the immutable resource id and remains intact.

update public.resources
set slug = 'open-skylim8', updated_at = now()
where id = 'adeae55b-41d5-41dc-81b0-a0682d02f7f9'
  and slug = 'open-skylim8-uhax-5163b0'
  and not exists (
    select 1 from public.resources existing
    where existing.slug = 'open-skylim8'
      and existing.id <> 'adeae55b-41d5-41dc-81b0-a0682d02f7f9'
  );
