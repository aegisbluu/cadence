
CREATE TABLE IF NOT EXISTS public.screenshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  image_data TEXT NOT NULL,
  timer_elapsed INTEGER,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL
);

ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own screenshots" ON public.screenshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own screenshots" ON public.screenshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all screenshots" ON public.screenshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete screenshots" ON public.screenshots FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete old screenshots" ON public.screenshots FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshots;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'dtr_log_user_id_fkey' AND table_name = 'dtr_log'
  ) THEN
    ALTER TABLE public.dtr_log ADD CONSTRAINT dtr_log_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can manage their own active timer" ON public.active_timers;
CREATE POLICY "Users can manage their own active timer" ON public.active_timers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "All users can read active_timers" ON public.active_timers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance;
CREATE POLICY "Users can manage their own attendance" ON public.attendance FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "All users can read attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
