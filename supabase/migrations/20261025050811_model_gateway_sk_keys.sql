-- Model keys are hashed and verified by Open-Connect, never registered with upstream providers.
-- Existing keys and OAuth issuance retain their original scopes and prefixes.
alter table public.api_keys add constraint api_keys_model_key_scopes check (
  left(key_prefix,6) <> 'sk-oc-' or
  (scopes is not null and array_position(scopes,null) is null and
   scopes <@ array['models:read','models:invoke']::text[])
);

create or replace function public.oc_verify_gateway_key(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare k public.api_keys;
begin
 if p_key is null or (left(p_key,8) <> 'oc_live_' and p_key !~ '^sk-oc-[A-Za-z0-9_-]{32}$') or length(p_key)>256 then return null; end if;
 select * into k from public.api_keys where key_hash=encode(extensions.digest(p_key,'sha256'),'hex') and revoked_at is null and (expires_at is null or expires_at>now());
 if not found then return null; end if;
 if left(p_key,6) = 'sk-oc-' then
   k.scopes := array(select s from unnest(k.scopes) s where s in ('models:read','models:invoke'));
 end if;
 update public.api_keys set last_used_at=now() where id=k.id;
 return jsonb_build_object('id',k.id,'user_id',k.user_id,'scopes',k.scopes,'expires_at',k.expires_at,'organization_id',k.organization_id,'workspace_id',k.workspace_id,'project_id',k.project_id,'access_profile',k.access_profile);
end $function$;

revoke all on function public.oc_verify_gateway_key(text) from public;
grant execute on function public.oc_verify_gateway_key(text) to anon,authenticated;
