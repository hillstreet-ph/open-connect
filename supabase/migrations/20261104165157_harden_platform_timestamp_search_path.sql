-- Issue #80: the current trigger only calls pg_catalog.now() and touches NEW.
-- Pin its lookup path without changing any function body, ownership or ACL.
-- Do not replay 20260920130000_harden_advisor_exposed_functions.sql: subsequent
-- OAuth migrations intentionally restored client-role RPC contracts.
alter function platform.set_updated_at()
  set search_path = pg_catalog;
