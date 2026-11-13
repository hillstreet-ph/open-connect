-- Exact-byte duplicate protection for new private upload/import candidates.
create unique index resources_owned_content_hash_type on public.resources(owner_id,(installation_config->>'content_sha256'),resource_type)
 where owner_id is not null and source in ('user-upload','url-import') and installation_config->>'content_sha256' is not null;

-- Only the trusted broker can rotate an OAuth bundle. The private definer has
-- the narrow Vault privilege; its public wrapper is invoker-only/service-only.
create function private.rotate_connection_oauth_bundle(p_user_id uuid,p_connection_id uuid,p_expected text,p_value text)
returns boolean language plpgsql security definer set search_path='' as $$
declare secret_id uuid; vault_id uuid; old_value text;
begin
 if p_value::jsonb->'tokens'->>'access_token' is null then raise exception 'OAuth token bundle required'; end if;
 select s.id,s.vault_secret_id into secret_id,vault_id from public.credential_secrets s
 join public.app_connections c on c.user_id=s.user_id and c.credential_reference='credential://'||c.provider||'/'||s.id::text
 where c.id=p_connection_id and c.user_id=p_user_id and c.metadata->>'auth_type'='oauth' for update of s;
 if not found then raise exception 'Owned OAuth connection not found'; end if;
 select decrypted_secret into old_value from vault.decrypted_secrets where id=vault_id;
 if old_value is distinct from p_expected then return false; end if;
 perform vault.update_secret(vault_id,p_value);
 update public.credential_secrets set updated_at=now() where id=secret_id;
 return true;
end $$;
revoke all on function private.rotate_connection_oauth_bundle(uuid,uuid,text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.rotate_connection_oauth_bundle(uuid,uuid,text,text) to service_role;
create function public.rotate_connection_oauth_bundle(p_user_id uuid,p_connection_id uuid,p_expected text,p_value text)
returns boolean language sql security invoker set search_path='' as $$select private.rotate_connection_oauth_bundle(p_user_id,p_connection_id,p_expected,p_value)$$;
revoke all on function public.rotate_connection_oauth_bundle(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.rotate_connection_oauth_bundle(uuid,uuid,text,text) to service_role;
