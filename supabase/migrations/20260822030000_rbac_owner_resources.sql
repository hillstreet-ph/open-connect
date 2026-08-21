-- Allow authenticated users to manage their own resource packages (upload/download/delete).
-- Admins/owners retain full catalog control via existing policies.

CREATE POLICY "Users manage own resources"
  ON public.resources
  FOR ALL
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'owner')
  );

-- Ensure authenticated can INSERT into resources when owner_id matches
GRANT INSERT, UPDATE, DELETE ON public.resources TO authenticated;
