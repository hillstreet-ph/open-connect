-- Saved conversations require a registered account in addition to ownership.
alter policy agent_chats_owner on public.agent_chats
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
