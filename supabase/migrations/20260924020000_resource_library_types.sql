-- Marketplace packages may represent every reusable personal-library capability.
alter type public.resource_type add value if not exists 'toolkit';
alter type public.resource_type add value if not exists 'memory';
alter type public.resource_type add value if not exists 'knowledge';
