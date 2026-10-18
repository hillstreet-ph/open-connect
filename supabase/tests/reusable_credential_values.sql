-- Run with request.jwt.claim.sub set to a valid test owner.
-- All test rows and Vault changes are rolled back. No secrets are returned.
begin;
do $$
begin
  if has_function_privilege('anon','public.update_credential_secret_value(uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.assert_credential_value_unique(text)','EXECUTE') then
    raise exception 'Anonymous credential mutation/validation grant';
  end if;
  if not has_function_privilege('authenticated','public.update_credential_secret_value(uuid,text)','EXECUTE') then
    raise exception 'Authenticated rotation grant missing';
  end if;
end;
$$;
do $$
declare
  owner_id uuid := auth.uid();
  first_id uuid;
  second_id uuid;
  old_vault_id uuid;
  seed_id uuid;
  shared_value text := gen_random_uuid()::text;
  blocked boolean;
begin
  if owner_id is null then raise exception 'Set a valid test owner first'; end if;
  first_id := (public.create_credential_item('Credential regression', 'password', '{}',
    shared_value, '', '', 'https://example.invalid', '', 'JBSWY3DPEHPK3PXP')->>'id')::uuid;
  perform public.assert_credential_value_unique(shared_value);
  second_id := (public.create_credential_item('Credential regression', 'password', '{}',
    shared_value, '', '', 'https://other.example.invalid', '', '')->>'id')::uuid;
  if first_id = second_id then raise exception 'Repeated values reused record identity'; end if;
  select vault_secret_id, totp_vault_secret_id into old_vault_id, seed_id
    from public.credential_secrets where id = first_id;
  perform public.update_credential_secret_value(first_id, shared_value);
  if exists(select 1 from vault.secrets where id = old_vault_id) then
    raise exception 'Rotation retained stale Vault value'; end if;
  if not exists(select 1 from public.credential_secrets where id = first_id
    and secret_value is null and totp_vault_secret_id = seed_id) then
    raise exception 'Rotation changed TOTP or plaintext invariant'; end if;
  if public.reveal_credential_secret(second_id)->>'value' <> shared_value then
    raise exception 'Rotating one credential changed the other'; end if;
  if public.get_credential_totp_code(first_id)->>'code' !~ '^[0-9]{6}$' then
    raise exception 'TOTP no longer works after rotation'; end if;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  blocked := false;
  begin perform public.update_credential_secret_value(first_id, shared_value);
    exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Another owner changed the credential'; end if;
  blocked := false;
  begin perform public.reveal_credential_secret(first_id);
    exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Another owner revealed the credential'; end if;
  blocked := false;
  begin perform public.get_credential_totp_code(first_id);
    exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Another owner obtained TOTP'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  blocked := false;
  begin perform public.assert_credential_value_unique(shared_value);
    exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Unauthenticated legacy validation accepted'; end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
end;
$$;
select 'duplicate creation, isolated rotation, TOTP and owner boundaries passed' as result;
rollback;
-- Verify the API-role grant boundary even with a valid synthetic owner's claim.
set role anon;
do $$
declare blocked boolean := false;
begin
  begin perform public.assert_credential_value_unique('synthetic-value');
    exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous role invoked credential validation'; end if;
end;
$$;
reset role;
begin;
set role authenticated;
do $$
declare
  first_id uuid;
  second_id uuid;
  shared_value text := gen_random_uuid()::text;
begin
  if not public.assert_credential_value_unique('synthetic-value') then
    raise exception 'Authenticated owner validation failed'; end if;
  first_id := (public.create_credential_item('API-role regression','password','{}',
    shared_value,'','','https://example.invalid','','')->>'id')::uuid;
  second_id := (public.create_credential_item('API-role regression','password','{}',
    shared_value,'','','https://other.example.invalid','','')->>'id')::uuid;
  perform public.update_credential_secret_value(first_id,shared_value);
  if public.reveal_credential_secret(first_id)->>'value' <> shared_value
    or public.reveal_credential_secret(second_id)->>'value' <> shared_value then
    raise exception 'Authenticated API-role create/update/reveal failed'; end if;
end;
$$;
reset role;
rollback;
