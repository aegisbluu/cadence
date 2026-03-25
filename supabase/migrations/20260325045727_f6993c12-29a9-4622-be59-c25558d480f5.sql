
-- Function to get a user's department (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_department(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Allow users to view profiles in the same department
CREATE POLICY "Users can view same department profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    department IS NOT NULL
    AND department = public.get_user_department(auth.uid())
  );
