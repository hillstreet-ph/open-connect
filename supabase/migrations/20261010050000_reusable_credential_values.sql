-- Credential identity is its ID, never its password or token value.
-- Keep the legacy validation RPC callable by already-deployed clients, without
-- decrypting every owned entry or rejecting values shared across login records.
create or replace function public.assert_credential_value_unique(p_secret_value text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return true;
end;
$$;

create or replace function public.update_credential_secret_value(p_id uuid, p_secret_value text)
returns jsonb
language plpgsql security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_type text;
  v_name text;
  v_old_vault_id uuid;
  v_new_vault_id uuid;
begin
  if v_owner is null then raise exception 'unauthorized'; end if;
  if p_secret_value is null or length(p_secret_value) < 4 then
    raise exception 'Secret value required (min 4 characters)';
  end if;

  select secret_type, name, vault_secret_id
    into v_type, v_name, v_old_vault_id
  from public.credential_secrets
  where id = p_id and user_id = v_owner
  for update;
  if not found then raise exception 'Credential not found or access denied'; end if;

  if v_type in ('api_key', 'oauth_token', 'bot_token') and p_secret_value ~ '\s' then
    raise exception 'API keys and tokens cannot contain spaces or sentences';
  end if;

  v_new_vault_id := vault.create_secret(
    p_secret_value,
    'open_connect_' || p_id::text || '_' || gen_random_uuid()::text,
    'Updated Open-Connect credential ' || p_id::text
  );

  update public.credential_secrets
  set secret_value = null,
      vault_secret_id = v_new_vault_id,
      updated_at = now()
  where id = p_id and user_id = v_owner;

  if v_old_vault_id is not null then
    delete from vault.secrets where id = v_old_vault_id;
  end if;

  return jsonb_build_object('id', p_id, 'name', v_name, 'updated_at', now());
end;
$$;

revoke all on function public.assert_credential_value_unique(text) from public, anon;
revoke all on function public.update_credential_secret_value(uuid, text) from public, anon;
grant execute on function public.assert_credential_value_unique(text) to authenticated;
grant execute on function public.update_credential_secret_value(uuid, text) to authenticated;
