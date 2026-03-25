-- Task notes/subtasks
CREATE TABLE IF NOT EXISTS public.task_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their task notes" ON public.task_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all task notes" ON public.task_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add scope to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS scope TEXT;

-- Break tracking on active_timers
ALTER TABLE public.active_timers ADD COLUMN IF NOT EXISTS is_break BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.active_timers ADD COLUMN IF NOT EXISTS break_started_at TIMESTAMP WITH TIME ZONE;

-- DTR log
CREATE TABLE IF NOT EXISTS public.dtr_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_in TIMESTAMP WITH TIME ZONE NOT NULL,
  time_out TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.dtr_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own DTR" ON public.dtr_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all DTR" ON public.dtr_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert their DTR" ON public.dtr_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their DTR" ON public.dtr_log FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dtr_log;

-- Projects and tasks visible to all authenticated
CREATE POLICY "All users can view all projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "All users can view all tasks" ON public.tasks FOR SELECT TO authenticated USING (true);