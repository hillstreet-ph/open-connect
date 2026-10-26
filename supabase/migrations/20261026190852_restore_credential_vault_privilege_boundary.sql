-- Restore the credential RPC boundary after broad grant drift.
-- No credential contents or owners are changed. Keep existing RPC signatures.
revoke all on public.credential_secrets, public.credential_secrets_meta,
 public.service_credentials, public.credential_folders,
 public.credential_folder_items, public.credential_folder_projects,
 public.project_credentials from public, anon, authenticated;
grant all on public.credential_secrets, public.service_credentials,
 public.credential_folders, public.credential_folder_items,
 public.credential_folder_projects, public.project_credentials to service_role;
do $$
declare fn regprocedure;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname = any(array[
 'create_credential_secret','create_credential_item','list_credential_secrets',
 'reveal_credential_secret','get_credential_totp_code','delete_credential_secret',
 'update_credential_secret_value','organize_credential','update_credential_organization',
 'create_credential_folder','list_credential_folders','update_credential_folder',
 'delete_credential_folder','add_project_credential','remove_project_credential',
 'list_project_credentials','assert_credential_value_unique'])
 loop
 execute format('revoke all on function %s from public, anon',fn);
 execute format('grant execute on function %s to authenticated, service_role',fn);
 end loop;
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname = any(array[
 'resolve_connection_credential','get_service_credential','set_service_credential',
 'rotate_connection_oauth_bundle'])
 loop
 execute format('revoke all on function %s from public, anon, authenticated',fn);
 execute format('grant execute on function %s to service_role',fn);
 end loop;
end $$;
