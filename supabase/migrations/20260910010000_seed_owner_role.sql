-- Seed owner role for the platform founder on first sign-up.
-- The handle_new_user() trigger already inserts the 'user' role.
-- This companion trigger checks the email and upgrades to 'owner'.

CREATE OR REPLACE FUNCTION private.maybe_seed_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_email text;
BEGIN
  -- Platform owner email — change this if ownership transfers.
  _owner_email := 'kairocasino8@gmail.com';

  IF lower(NEW.email) = lower(_owner_email) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Fire after handle_new_user so the 'user' row already exists.
CREATE TRIGGER on_auth_user_created_seed_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.maybe_seed_owner();

-- If the user already exists (e.g. from email sign-up before this migration),
-- retroactively grant the owner role.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role
FROM auth.users
WHERE lower(email) = lower('kairocasino8@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;