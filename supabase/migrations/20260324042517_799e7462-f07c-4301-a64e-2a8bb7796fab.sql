
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;

CREATE TABLE IF NOT EXISTS public.active_timers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'work',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own active timer' AND tablename = 'active_timers') THEN
    CREATE POLICY "Users can manage their own active timer"
      ON public.active_timers FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all active timers' AND tablename = 'active_timers') THEN
    CREATE POLICY "Admins can view all active timers"
      ON public.active_timers FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_timers;

CREATE TRIGGER update_active_timers_updated_at
  BEFORE UPDATE ON public.active_timers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
