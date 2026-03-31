
-- Allow admins to delete any profile
CREATE POLICY "Admins can delete all profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete any time_entries
CREATE POLICY "Admins can delete all time entries"
  ON public.time_entries FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete task_notes
CREATE POLICY "Admins can delete task notes"
  ON public.task_notes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete dtr_log
CREATE POLICY "Admins can delete dtr logs"
  ON public.dtr_log FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete attendance
CREATE POLICY "Admins can delete attendance"
  ON public.attendance FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Full account deletion RPC
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  DELETE FROM public.active_timers WHERE user_id = target_user_id;
  DELETE FROM public.attendance WHERE user_id = target_user_id;
  DELETE FROM public.dtr_log WHERE user_id = target_user_id;
  DELETE FROM public.screenshots WHERE user_id = target_user_id;
  DELETE FROM public.task_notes WHERE user_id = target_user_id;
  DELETE FROM public.time_entries WHERE user_id = target_user_id;
  DELETE FROM public.subtasks WHERE user_id = target_user_id;
  DELETE FROM public.tasks WHERE user_id = target_user_id;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
