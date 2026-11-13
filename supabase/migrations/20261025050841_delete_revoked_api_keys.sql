-- Applies to all Open-Connect generated keys, including OAuth and legacy keys.
-- Request logs retain their existing ON DELETE SET NULL foreign-key behavior.
create or replace function public.oc_delete_revoked_api_key()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $function$
begin
  if new.revoked_at is not null then
    delete from public.api_keys where id = new.id and revoked_at is not null;
  end if;
  return null;
end;
$function$;
revoke all on function public.oc_delete_revoked_api_key() from public,anon,authenticated;
create trigger oc_delete_revoked_api_key
  after insert or update of revoked_at on public.api_keys
  for each row execute function public.oc_delete_revoked_api_key();

-- Remove already revoked generated keys as requested; keep active keys unchanged.
delete from public.api_keys where revoked_at is not null;
