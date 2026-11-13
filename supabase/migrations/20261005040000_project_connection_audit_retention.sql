begin;

-- Keep the audit trail when a connection owner revokes or disconnects a provider.
alter table public.project_connection_audit
  alter column connection_id drop not null;

alter table public.project_connection_audit
  drop constraint if exists project_connection_audit_connection_id_fkey;

alter table public.project_connection_audit
  add constraint project_connection_audit_connection_id_fkey
  foreign key (connection_id)
  references public.app_connections(id)
  on delete set null;

commit;
