
-- Drop if exists to avoid duplicate
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Allow admins to update any profile (name, job_title, department)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
