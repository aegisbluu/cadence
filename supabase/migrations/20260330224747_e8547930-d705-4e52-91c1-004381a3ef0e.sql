
ALTER TABLE public.profiles ALTER COLUMN screenshot_interval SET DEFAULT 1800;

CREATE OR REPLACE FUNCTION public.get_user_emails()
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, email FROM auth.users;
$$;

REVOKE ALL ON FUNCTION public.get_user_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_emails() TO authenticated;
